import { describe, expect, it } from 'vitest'
import { escapeSlack, rateLimitMessage, slackDate } from './messages'

const HOUR_MS = 3_600_000

describe('slackDate', () => {
  it('builds a date token in unix seconds with a readable fallback', () => {
    const ms = Date.UTC(2026, 10, 3, 9, 30)

    expect(slackDate(ms)).toBe(
      `<!date^${ms / 1000}^{date_short_pretty} {time}|2026-11-03 09:30 UTC>`,
    )
  })
})

describe('escapeSlack', () => {
  it('escapes the characters Slack treats as control characters', () => {
    expect(escapeSlack('A & B <b> "c"')).toBe('A &amp; B &lt;b&gt; "c"')
  })
})

describe('rateLimitMessage', () => {
  const windowStart = Date.UTC(2026, 10, 3, 9)
  const message = rateLimitMessage({
    senderName: 'Sender One',
    senderEmail: 'one@ethereal.email',
    limit: 200,
    windowStart,
    windowMs: HOUR_MS,
    deferredUntil: windowStart + HOUR_MS,
    subject: 'Spring <sale> & more',
  })

  it('opens with a header and ends with the reassurance line', () => {
    expect(message.blocks[0]).toEqual({
      type: 'header',
      text: { type: 'plain_text', text: 'Hourly limit reached' },
    })
    expect(message.blocks[2]).toMatchObject({
      type: 'context',
      elements: [{ text: 'Deferred emails keep their order and resume automatically.' }],
    })
  })

  it('lists sender, limit, window, next send and campaign', () => {
    const section = message.blocks[1] as { fields: { text: string }[] }
    const text = section.fields.map((field) => field.text)

    expect(text[0]).toBe('*Sender*\nSender One (one@ethereal.email)')
    expect(text[1]).toBe('*Limit*\n200 per hour')
    expect(text[2]).toContain('*Window*\n<!date^')
    expect(text[3]).toBe(`*Next send*\n${slackDate(windowStart + HOUR_MS)}`)
    expect(text[4]).toBe('*Campaign*\nSpring &lt;sale&gt; &amp; more')
  })

  it('carries a plain text fallback for notifications', () => {
    expect(message.text).toContain('one@ethereal.email')
    expect(message.text).toContain('200 per hour')
  })
})
