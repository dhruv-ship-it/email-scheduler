# Deployment

Everything runs on one Linux VM, behind one domain: `scheduler.dhruvranjan.dev`. Caddy takes the HTTPS traffic and proxies it to the web container. That container's nginx serves the built frontend and forwards `/api` to the api. The browser only ever talks to one origin, so the session cookie is first-party and the app needs no CORS setup.

```text
browser -> Caddy (80, 443) -> web (nginx) -> /api -> api
```

## The VM

I sized it at 4 GB of RAM. The memory limits in `compose.prod.yaml` add up to about 3 GB: Elasticsearch 1 GB, the api, the worker and Postgres 512 MB each, Redis 256 MB, Caddy 128 MB and the web container 64 MB.

1. Create the VM with any provider. I use Ubuntu 24.04 LTS with 2 vCPUs and 4 GB of RAM. Allow inbound TCP on ports 22, 80 and 443 in its firewall.
2. Add a DNS A record for `scheduler.dhruvranjan.dev` that points at the VM's public IP. Caddy requests the certificate on first start, so the name has to resolve before then. You can check with `dig +short scheduler.dhruvranjan.dev`.
3. Install Docker with the Compose plugin, and let your user run it:

   ```sh
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker "$USER"
   ```

   Log out and back in so the group change applies.

4. Elasticsearch needs a higher map count than most distributions set:

   ```sh
   sudo sysctl -w vm.max_map_count=262144
   echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-elasticsearch.conf
   ```

5. Clone the repo:

   ```sh
   git clone https://github.com/dhruv-ship-it/email-scheduler.git
   cd email-scheduler
   ```

6. Write `.env`:

   ```sh
   cp .env.example .env
   ```

   Values that must change from the example:

   | Variable                                   | Value                                     |
   | ------------------------------------------ | ----------------------------------------- |
   | `APP_DOMAIN`                               | `scheduler.dhruvranjan.dev`               |
   | `SESSION_SECRET`                           | `openssl rand -base64 48`                 |
   | `ENCRYPTION_KEY`                           | `openssl rand -base64 32`                 |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from the Google console, see below        |
   | `POSTGRES_PASSWORD`                        | a new password                            |
   | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`   | optional, leave empty to switch Slack off |

   `NODE_ENV`, `BULL_BOARD_READ_ONLY` and `APP_URL` are set in `compose.prod.yaml` and override whatever `.env` says. `APP_URL` is `https://scheduler.dhruvranjan.dev`. If the domain changes, edit `APP_URL` there, set `APP_DOMAIN` in `.env`, and update the Google and Slack settings below.

7. Start everything with one command:

   ```sh
   docker compose -f compose.yaml -f compose.prod.yaml --profile app up -d --build
   ```

   `migrate` applies the database migrations and exits. The api and worker start after it succeeds, then the web container, then Caddy. The first build takes a few minutes.

8. Check it:

   ```sh
   curl https://scheduler.dhruvranjan.dev/api/health
   ```

   It should return `{"ok":true}`. Then open `https://scheduler.dhruvranjan.dev` and sign in.

Postgres, Redis, Elasticsearch, the api and the web container publish no ports in production. Only Caddy listens on the host.

## Google sign-in

In the Google Cloud console, edit the OAuth client:

- Authorized JavaScript origin: `https://scheduler.dhruvranjan.dev`
- Authorized redirect URI: `https://scheduler.dhruvranjan.dev/api/auth/google/callback`

The redirect URI is built from `APP_URL`, so it has to match the domain in `compose.prod.yaml`.

## Slack

Slack is optional. To switch it on:

- Set `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` in `.env`.
- In the Slack app, add the redirect URL `https://scheduler.dhruvranjan.dev/api/integrations/slack/callback`.

Leave `SLACK_REDIRECT_BASE_URL` empty. It exists for local development, where Slack needs an HTTPS URL and a tunnel stands in for `localhost`.

## Updating

```sh
cd email-scheduler
git pull
docker compose -f compose.yaml -f compose.prod.yaml --profile app up -d --build
```

Compose rebuilds the server and web images and recreates the containers whose image changed. Emails scheduled before the update are in Redis and Postgres, so they keep their send times. If Redis was wiped, the reconciler rebuilds the jobs from Postgres when the worker starts.

If you only changed `.env`, run the same command without `--build`.

## Why a VM and not Render

Render's free tier blocks outbound SMTP on ports 465 and 587 since September 2025, and Ethereal is reached on 587, so no email would send. The worker also has to stay running between sends, which a free web service that sleeps does not do. A small VM runs the whole compose file unchanged.
