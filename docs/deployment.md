# Deployment

The frontend runs on Vercel at `scheduler.dhruvranjan.dev`. The backend runs on one Linux VM at `scheduler-api.dhruvranjan.dev`. The browser only ever talks to the frontend domain: Vercel rewrites `/api/*` to the VM, so the session cookie is first-party and the app needs no CORS setup.

## The VM

I sized it at 4 GB of RAM. The memory limits in `compose.prod.yaml` add up to about 3 GB: Elasticsearch 1 GB, the api, the worker and Postgres 512 MB each, Redis 256 MB, Caddy 128 MB.

1. Install Docker with the Compose plugin.
2. Elasticsearch needs a higher map count than most distributions set:

   ```sh
   sudo sysctl -w vm.max_map_count=262144
   echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-elasticsearch.conf
   ```

3. Point an A record for `scheduler-api.dhruvranjan.dev` at the VM and open ports 80 and 443. Caddy requests the certificate on first start, so DNS has to resolve before then.
4. Clone the repo and create `.env`:

   ```sh
   cp .env.example .env
   ```

   Values that must change from the example:

   | Variable                                   | Value                                     |
   | ------------------------------------------ | ----------------------------------------- |
   | `SESSION_SECRET`                           | `openssl rand -base64 48`                 |
   | `ENCRYPTION_KEY`                           | `openssl rand -base64 32`                 |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from the Google console, see below        |
   | `POSTGRES_PASSWORD`                        | a new password                            |
   | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`   | optional, leave empty to switch Slack off |

   `NODE_ENV`, `BULL_BOARD_READ_ONLY` and `APP_URL` are set in `compose.prod.yaml` and override whatever `.env` says. `API_DOMAIN` defaults to `scheduler-api.dhruvranjan.dev`. If the domains change, edit `APP_URL` in `compose.prod.yaml`, the rewrite in `apps/web/vercel.json` and the Google and Slack settings below.

5. Start the backend. I name the services because the `web` service in `compose.yaml` is for local reviewers:

   ```sh
   docker compose -f compose.yaml -f compose.prod.yaml --profile app up -d --build \
     migrate api worker caddy
   ```

   `migrate` applies the database migrations and exits. The api and worker start after it succeeds.

6. Check it:

   ```sh
   curl https://scheduler-api.dhruvranjan.dev/api/health
   ```

   It should return `{"ok":true}`.

Postgres, Redis, Elasticsearch and the api publish no ports in production. Only Caddy listens on the host, and it proxies to the api over the compose network.

## Vercel

Create a project from the repo with these settings:

- Root directory: `apps/web`.
- Include source files outside of the Root Directory: on. The web app imports the `packages/shared` workspace.
- Node.js version: 22.

`apps/web/vercel.json` supplies the install and build commands, the output directory, the `/api/*` rewrite to the VM and the fallback to `index.html` for client-side routes.

## Google sign-in

In the Google Cloud console, edit the OAuth client:

- Authorized JavaScript origin: `https://scheduler.dhruvranjan.dev`
- Authorized redirect URI: `https://scheduler.dhruvranjan.dev/api/auth/google/callback`

The redirect URI is built from `APP_URL`, so it has to match the frontend domain, not the API domain.

## Slack

Slack is optional. To switch it on:

- Set `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` in `.env`.
- In the Slack app, add the redirect URL `https://scheduler.dhruvranjan.dev/api/integrations/slack/callback`.

Leave `SLACK_REDIRECT_BASE_URL` empty. It exists for local development, where Slack needs an HTTPS URL and a tunnel stands in for `localhost`.

## Updating

```sh
git pull
docker compose -f compose.yaml -f compose.prod.yaml --profile app up -d --build \
  migrate api worker caddy
```

Compose rebuilds the server image and recreates the containers whose image changed. Emails scheduled before the update are in Redis and Postgres, so they keep their send times. If Redis was wiped, the reconciler rebuilds the jobs from Postgres when the worker starts.

## Why a VM and not Render

Render's free tier blocks outbound SMTP on ports 465 and 587 since September 2025, and Ethereal is reached on 587, so no email would send. The worker also has to stay running between sends, which a free web service that sleeps does not do. A small VM runs the whole compose file unchanged.
