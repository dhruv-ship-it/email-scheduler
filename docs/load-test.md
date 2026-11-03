# Load test

The brief asks what happens when 1000 or more emails are due at once and the hourly limit would be exceeded. I did not send thousands of emails through Ethereal. I tested the part that decides the outcome: the Redis script that reserves a send slot, hit by many connections at the same moment.

## What it does

`apps/server/src/scripts/load-test.ts` opens several Redis connections and has them reserve slots against one fresh test bucket, the same way several worker processes would. It uses real hourly windows, prints how many reservations landed in each window, checks the result and then deletes its keys.

```sh
npm run load-test -w apps/server -- --count 1000 --connections 10 --limit 200
```

| Flag            | Default | Meaning                                                |
| --------------- | ------- | ------------------------------------------------------ |
| `--count`       | 1000    | reservations to make                                   |
| `--connections` | 10      | Redis connections, each with one reservation in flight |
| `--limit`       | 200     | cap per window                                         |
| `--interval`    | 0       | pacing gap in milliseconds                             |

It needs Redis (`docker compose up -d`) and exits with an error if a window holds more than its limit.

## Run: 1000 reservations, 10 connections, limit 200

```text
reservations 1000, connections 10, limit 200 per window, interval 0 ms, window 3600000 ms

window start            reserved   limit
2026-11-03 06:00 UTC         200     200
2026-11-03 07:00 UTC         200     200
2026-11-03 08:00 UTC         200     200
2026-11-03 09:00 UTC         200     200
2026-11-03 10:00 UTC         200     200

max per window <= limit: ok (max 200)
same-millisecond slots: 956 (allowed with interval 0)
order inversions: 3
elapsed: 202 ms
```

1000 emails fill five windows with exactly 200 each, so the last one goes out four hours after the first window opens. Nothing was dropped and no window went over its limit, although ten connections were racing.

Two lines need explaining:

- **Same-millisecond slots.** With an interval of 0 there is no gap between sends, so two reservations made in the same millisecond get the same time. That is allowed. The check that counts duplicate slots only applies when an interval is set.
- **Order inversions.** This counts results that came back earlier than the one before them. Ten connections receive their replies in a slightly different order than Redis ran them, so a few are expected. It is about the order replies arrive in, not about two emails being handed the same capacity.

## Run: with a pacing gap

```sh
npm run load-test -w apps/server -- --count 300 --connections 10 --limit 100 --interval 7
```

```text
reservations 300, connections 10, limit 100 per window, interval 7 ms, window 3600000 ms

window start            reserved   limit
2026-11-03 06:00 UTC         100     100
2026-11-03 07:00 UTC         100     100
2026-11-03 08:00 UTC         100     100

max per window <= limit: ok (max 100)
duplicate slots: 0 (ok)
order inversions: 45
elapsed: 95 ms
```

With a gap set, every slot is distinct, which is what lets the app space real sends by `MIN_SEND_INTERVAL_MS`.

## What this does not show

The test measures the reservation, not delivery. It does not run workers, SMTP or Postgres. The send worker with a real limit, a short window and the JSON transport is covered by an integration test (`apps/server/src/queue/workers/send.int.test.ts`) that schedules six emails against a cap of three and checks that three go out in the first window and three after it.
