import { describe, expect, it } from 'vitest'
import { buildSearchBody, escapeLike, statusesForSearchTab } from './query'

describe('statusesForSearchTab', () => {
  it('searches what each tab lists', () => {
    expect(statusesForSearchTab('scheduled')).toEqual(['scheduled', 'throttled', 'sending'])
    expect(statusesForSearchTab('sent')).toEqual(['sent', 'failed'])
  })

  it('searches every status for the all tab', () => {
    expect(statusesForSearchTab('all')).toEqual([
      'scheduled',
      'throttled',
      'sending',
      'sent',
      'failed',
      'cancelled',
    ])
  })
})

describe('buildSearchBody', () => {
  const body = buildSearchBody({
    userId: 'user-1',
    q: 'ada@exa',
    statuses: ['sent', 'failed'],
    limit: 20,
  })

  it('filters on the user and the tab statuses so nobody sees another user mail', () => {
    expect(body.query).toMatchObject({
      bool: { filter: [{ term: { userId: 'user-1' } }, { terms: { status: ['sent', 'failed'] } }] },
    })
  })

  it('matches half-typed words across recipient, subject and body, weighted', () => {
    expect(body.query).toMatchObject({
      bool: {
        must: [
          {
            multi_match: {
              query: 'ada@exa',
              type: 'bool_prefix',
              fields: ['recipient.email^3', 'recipient^2', 'subject^2', 'bodyText'],
            },
          },
        ],
      },
    })
  })

  it('asks for html-encoded mark highlights so the client can render them safely', () => {
    expect(body.highlight).toMatchObject({
      encoder: 'html',
      pre_tags: ['<mark>'],
      post_tags: ['</mark>'],
      fields: { bodyText: { fragment_size: 120, number_of_fragments: 1 } },
    })
  })

  it('sorts by relevance, then newest first, and applies the limit', () => {
    expect(body.sort).toEqual(['_score', { scheduledAt: 'desc' }])
    expect(body.size).toBe(20)
  })
})

describe('escapeLike', () => {
  it('escapes the wildcard characters and the escape character itself', () => {
    expect(escapeLike('50%_off\\now')).toBe('50\\%\\_off\\\\now')
  })

  it('leaves ordinary text alone', () => {
    expect(escapeLike('hello world')).toBe('hello world')
  })
})
