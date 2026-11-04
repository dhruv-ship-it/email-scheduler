# Email Job Scheduler

A service and dashboard for scheduling emails at scale. Emails are stored in Postgres, scheduled as BullMQ delayed jobs on Redis (no cron anywhere), and sent through Ethereal's fake SMTP from several senders. Per-sender and per-campaign hourly limits and the pacing between sends are enforced in Redis, so they hold across any number of workers. A restart loses nothing, and the same email is never sent twice.

- Demo video: `https://drive.google.com/drive/folders/105o8zCfj1gGk3I0-VcDFXvW0MKE8B9tY?usp=sharing`
- Live app: <!-- OWNER: add the live URL here -->

## Quick start

You need Docker and a Google OAuth client. Create the client at console.cloud.google.com and add `http://localhost:5173/api/auth/google/callback` as an authorized redirect URI.

### Reviewer mode: everything in Docker

```sh
cp .env.example .env
```

Fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` (`openssl rand -base64 48`) and `ENCRYPTION_KEY` (`openssl rand -base64 32`). Then:

```sh
docker compose --profile app up --build
```

Open http://localhost:5173. The first start creates three Ethereal sender accounts. To run several workers at once:

```sh
docker compose --profile app up -d --scale worker=3
```

### Dev mode: Node on the host

This needs Node 22 or newer.

```sh
docker compose up -d              # Postgres, Redis and Elasticsearch
npm ci
npm run db:migrate -w apps/server
npm run dev                       # api, worker and Vite together
```

Open http://localhost:5173. Vite proxies `/api` to the api on port 4000. The queue dashboard is at `/api/admin/queues` once you are signed in.

To put emails in the queue without the UI, in dev mode only:

```sh
npm run sample:schedule -w apps/server -- --user dev@example.com --create-user --count 3 --in 5
```

## Configuration

The server validates its environment at startup and prints every missing or invalid variable. Dev scripts read the root `.env`; Docker passes plain environment variables.

| Variable                                   | Default                  | What it does                                                                        |
| ------------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------- |
| `NODE_ENV`                                 | `development`            | `production` makes cookies Secure and trusts the proxy in front                     |
| `ROLE`                                     | `all`                    | `api`, `worker` or `all`; Docker runs the api and the worker as separate containers |
| `PORT`                                     | `4000`                   | api port                                                                            |
| `APP_URL`                                  | `http://localhost:5173`  | the origin the browser uses; OAuth redirect URIs are built from it                  |
| `LOG_LEVEL`                                | `info`                   | pino level                                                                          |
| `DATABASE_URL`                             | local Postgres           | Postgres connection string                                                          |
| `REDIS_URL`                                | `redis://localhost:6379` | Redis connection string                                                             |
| `ELASTICSEARCH_URL`                        | `http://localhost:9200`  | Elasticsearch base URL                                                              |
| `ELASTICSEARCH_API_KEY`                    | empty                    | only for a cluster with security on                                                 |
| `SESSION_SECRET`                           | required                 | signs the session cookie and the Slack OAuth state; 32 characters or more           |
| `ENCRYPTION_KEY`                           | required                 | base64 of 32 bytes; encrypts sender passwords and Slack tokens at rest              |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | required                 | Google sign-in                                                                      |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`   | empty                    | Slack features stay off while these are empty                                       |
| `SLACK_REDIRECT_BASE_URL`                  | empty                    | HTTPS origin for the Slack callback, such as a tunnel URL in local development      |
| `WORKER_CONCURRENCY`                       | `5`                      | jobs one worker process runs at once                                                |
| `MIN_SEND_INTERVAL_MS`                     | `2000`                   | minimum gap between two sends from one sender; `0` turns pacing off                 |
| `MAX_EMAILS_PER_HOUR_PER_SENDER`           | `200`                    | default hourly cap per sender; a sender's own limit overrides it                    |
| `MAX_EMAILS_PER_HOUR_GLOBAL`               | `0`                      | hourly cap across all senders; `0` turns it off                                     |
| `RATE_WINDOW_MS`                           | `3600000`                | length of a rate-limit window; lower it only for tests and the load test            |
| `SEND_MAX_ATTEMPTS`                        | `5`                      | tries for a temporary SMTP failure before the email is marked failed                |
| `ETHEREAL_SENDER_COUNT`                    | `3`                      | Ethereal accounts created on the first api start when there are no senders          |
| `MAIL_TRANSPORT`                           | `smtp`                   | `json` writes messages to a local transport instead of SMTP, for tests              |
| `BULL_BOARD_READ_ONLY`                     | `false`                  | `true` hides the retry and delete actions in the queue dashboard                    |

## How it works

[docs/architecture.md](docs/architecture.md) has the diagrams and the failure table. The short version:

**Scheduling.** `POST /api/campaigns` plans one send time per recipient, inserts the rows into Postgres in one transaction, then adds one BullMQ job per email with `delay = send time - now`. The job id is the email id. Nothing polls for due emails, and there is no cron.

**Delay between sends.** I chose a minimum of 2 seconds between two sends from the same sender (`MIN_SEND_INTERVAL_MS=2000`). A campaign can ask for a longer gap, never a shorter one.

**Hourly limits.** Each send first reserves a slot with one atomic Lua script in Redis. It checks the sender's cap, the campaign's cap and the global cap, which are counters per fixed window, plus the pacing cursor of each. If the earliest free slot is later than now, the job is moved to that time with `moveToDelayed`. A slot pushed by an hourly cap marks the email `throttled` with a `deferred` event, and the dashboard shows when it will go out. Nothing is dropped or failed. Every worker uses the same script, so the limit holds across processes.

**Concurrency.** `WORKER_CONCURRENCY` sets how many jobs a worker runs at once. Safety comes from the Lua reservation and from guarded status changes in Postgres, not from the worker count.

**Restarts.** Redis runs with append-only persistence, so delayed jobs and counters survive a Redis restart. On worker start, a reconciler pages through the emails that are still pending in Postgres and re-adds any job that is missing or already dead, using the same job id. A repeat run adds nothing.

**Idempotency.** The job id is the email id, so adding a job twice is a no-op. A job sends only if it moves the row into `sending`, and sent, failed and cancelled rows are skipped. The Message-ID is `<email id@scheduler.local>`, so even a repeat send is recognisable.

**Search.** A sync worker indexes each email into Elasticsearch after every status change. `GET /api/emails/search` uses a prefix match across recipient, subject and body, with highlights. If Elasticsearch is unreachable it falls back to a Postgres `ILIKE` and the dashboard says so.

**Slack.** A user connects Slack through OAuth. When a sender or global cap defers an email, one alert per user, sender and window is queued, and the worker posts it to the user's webhook. With no connection, the alert is skipped. A revoked webhook removes the connection.

**Queue dashboard.** Bull Board is served at `/api/admin/queues` behind the same login.

## When 1000 emails are scheduled at once

Take 1000 recipients, a 2-second delay, a limit of 200 per hour and a start at 10:40 UTC. The planner in `packages/shared` puts 200 emails in each of five hourly windows:

| Window (UTC) | Emails | Last one goes out |
| ------------ | ------ | ----------------- |
| 10:00        | 200    | 10:46:38          |
| 11:00        | 200    | 11:06:38          |
| 12:00        | 200    | 12:06:38          |
| 13:00        | 200    | 13:06:38          |
| 14:00        | 200    | 14:06:38          |

The whole run takes 3 h 26 m 38 s. The compose page shows this plan before you submit, and the worker enforces the same windows at send time even if the plan and reality drift apart.

The reservation script itself is fast. [docs/load-test.md](docs/load-test.md) has a run of 1000 reservations from 10 connections against a limit of 200: five windows of exactly 200, in 202 ms.

## Requirements and where they are

| Requirement                               | How it is done                                        | Where                                                       |
| ----------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| Schedule via API                          | `POST /api/campaigns`                                 | `apps/server/src/modules/campaigns`                         |
| BullMQ delayed jobs, no cron              | one delayed job per email                             | `modules/campaigns/create-campaign.ts`, `queue/queues.ts`   |
| Relational storage                        | Postgres with Drizzle                                 | `apps/server/src/db/schema.ts`                              |
| Multiple Ethereal senders                 | senders table, created on first start or by script    | `modules/senders`, `scripts/create-senders.ts`              |
| Survive restarts                          | AOF Redis plus a boot reconciler                      | `queue/reconcile.ts`, `compose.yaml`                        |
| No duplicates                             | job id is the email id, guarded status changes        | `modules/emails/transition.ts`, `queue/workers/send.ts`     |
| Configurable concurrency                  | `WORKER_CONCURRENCY`                                  | `queue/workers/send.ts`                                     |
| Minimum delay between sends               | `MIN_SEND_INTERVAL_MS`, plus the campaign's own delay | `queue/rate-limit/limiter.ts`                               |
| Hourly limits that defer                  | Redis Lua reservation, next window                    | `queue/rate-limit/reserve-slot.ts`, `queue/workers/send.ts` |
| Slack alert on a limit hit                | OAuth, then a live webhook post                       | `modules/slack`, `queue/workers/notifications.ts`           |
| Elasticsearch search                      | indexed on every status change, Postgres fallback     | `modules/search`, `queue/workers/search-sync.ts`            |
| Live queue dashboard                      | Bull Board behind login                               | `modules/admin/bull-board.ts`                               |
| Google login, name, email, avatar, logout | Google OAuth and a session cookie                     | `modules/auth`, `apps/web/src/app/account-menu.tsx`         |
| Scheduled and Sent lists                  | infinite lists with loading, empty and error states   | `apps/web/src/pages/mail-list.tsx`                          |
| Compose with a CSV upload and a count     | rich editor, streamed CSV parsing, live plan          | `apps/web/src/pages/compose.tsx`, `features/compose`        |
| Toasts                                    | sonner                                                | `apps/web/src/app/providers.tsx`                            |

## Ethereal

Ethereal is a fake SMTP service: it accepts mail and shows it at a preview URL, but delivers nothing. On the first api start, if the senders table is empty, the server creates `ETHEREAL_SENDER_COUNT` accounts and stores their passwords encrypted. Each sent email links to its Ethereal preview from the detail page.

To create senders by hand, for example one with a low cap to watch throttling:

```sh
npm run senders:create -w apps/server -- --count 1 --name "Small sender" --hourly-limit 3
```

## Assumptions and trade-offs

- I treat Postgres as the source of truth and Redis as a rebuildable copy. That is why a wiped Redis is recoverable, and why the first limit window after a wipe can exceed its cap once: the counters start from zero.
- Windows are fixed and aligned to the clock, not sliding. It is simple and exact, but a sender can send its full cap at the end of one hour and again at the start of the next.
- SMTP has no exactly-once delivery. If the process dies after the server accepts a message and before my update commits, the job runs again and sends a second copy with the same Message-ID. I chose at-least-once over marking such rows unknown and never resending them.
- With concurrency above 1, two emails planned within the same moment can swap places. Order is kept by the slot order, not by a global queue.
- Search is eventually consistent: Elasticsearch refreshes about once a second.
- I did not build a reindex script. The index and alias are created on start, and a mapping change would need a manual reindex.
- The email and password fields on the login page render as in the design, but submitting them only shows a note that email sign-in is not enabled, because the brief asks for Google login only. Attachments and archive are out of scope.
- The dashboard is built for desktop widths. I did not build a small-screen layout.
- The integration tests need Docker services, so CI runs the unit tests only.

## Tests and CI

```sh
npm test            # unit tests, no services needed
npm run test:int    # integration tests; needs docker compose up -d
npm run typecheck
npm run lint
```

Unit tests cover the planner, recipient parsing, encryption, the body sanitizer, session and Slack state tokens, SMTP error classification, cursors, the search query builder, the Slack message and CSV parsing in the web app. Integration tests run against real Postgres, Redis and Elasticsearch, in a separate test database and Redis db 15: the limiter under concurrent connections, the send worker with the rate limit, the reconciler, search, Bull Board, Slack and the HTTP endpoints. The search tests skip when Elasticsearch is not reachable.

GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, lint, the unit tests and the build on every push and pull request.

## Project layout

```text
apps/server/src
  config/        environment validation
  db/            Drizzle schema
  http/          Express app, JSON content-type guard
  lib/           crypto, logger, mailer, errors
  modules/       auth, campaigns, emails, search, senders, slack, admin
  queue/         queues, send, search-sync and notifications workers, reconciler
  queue/rate-limit/  the Lua reservation script and its client
  scripts/       create-senders, schedule-sample, reconcile, load-test
apps/web/src
  app/           shell, router, providers
  components/ui/ buttons, inputs, menus, popovers, badges
  features/      auth, emails, compose, slack, tour
  pages/         login, mail list, email detail, compose
packages/shared  planner, recipient parsing, API types and constants
docs/            architecture, deployment, load test
```
