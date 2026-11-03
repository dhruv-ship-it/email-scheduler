// KEYS: cursor_1, countPrefix_1, cursor_2, countPrefix_2, ...   (countPrefix ends with ':w:')
// ARGV: windowMs, n, limit_1, interval_1, limit_2, interval_2, ...
// returns { at, reason, pushedByIndex }
//
// Kept as a template string so tsx, tsup and vitest all load the same source: tsup
// would otherwise try to bundle a .lua file through a loader none of those three share.
//
// This checks the hourly cap before pacing, and keeps re-checking both until neither
// pushes the time any further. The spec's original draft checked pacing cursors
// first and used whatever time that produced as the sole input to the capacity
// check. That loses information: once one reservation gets pushed to the next
// window, it leaves its bucket's cursor sitting at that future window's start, and
// every later reservation then reads that cursor as a pacing delay and reports
// 'pacing' even though the real reason it can't run sooner is the hourly cap it
// never got to check for itself (its own window was already full, same as the
// first one's, but the capacity loop was never reached to say so). A test with a
// sender capped at 3 per window and six emails caught this: only the first deferred
// email came back as 'hourly', the other two came back as 'pacing' and so never
// got the throttled status, the deferred event or Slack-alert eligibility the spec
// gives hourly pushes. Checking capacity first, from the real current time, fixes
// that: every reservation independently discovers whether its own window is full
// before pacing ever gets to mask that with an inherited cursor.
export const RESERVE_SLOT_LUA = `
local windowMs = tonumber(ARGV[1])
local n = tonumber(ARGV[2])
local tm = redis.call('TIME')
local now = tonumber(tm[1]) * 1000 + math.floor(tonumber(tm[2]) / 1000)

local t = now
local reason = 'now'
local pushedBy = 0
local guard = 0

while true do
  while true do
    local w = math.floor(t / windowMs)
    local full = 0
    for i = 1, n do
      local limit = tonumber(ARGV[2 * i + 1])
      local used = tonumber(redis.call('GET', KEYS[2 * i] .. w) or '0')
      if used >= limit then full = i; break end
    end
    if full == 0 then break end
    t = (w + 1) * windowMs
    reason = 'hourly'
    pushedBy = full
    guard = guard + 1
    if guard > 10000 then return redis.error_reply('no free slot found') end
  end

  local movedByPacing = false
  for i = 1, n do
    local c = tonumber(redis.call('GET', KEYS[2 * i - 1]) or '0')
    if c > t then t = c; movedByPacing = true end
  end
  if not movedByPacing then break end
  if reason ~= 'hourly' then reason = 'pacing' end

  guard = guard + 1
  if guard > 10000 then return redis.error_reply('no free slot found') end
end

local w = math.floor(t / windowMs)
for i = 1, n do
  local interval = tonumber(ARGV[2 * i + 2])
  local countKey = KEYS[2 * i] .. w
  redis.call('INCR', countKey)
  redis.call('PEXPIREAT', countKey, (w + 2) * windowMs)
  redis.call('SET', KEYS[2 * i - 1], t + interval, 'PXAT', t + interval + windowMs)
end

return { t, reason, pushedBy }
`
