import { describe, expect, it } from 'vitest'
import { sanitizeBody } from './sanitize'

describe('sanitizeBody', () => {
  it('strips script tags and their content entirely', () => {
    const { bodyHtml, bodyText } = sanitizeBody('<p>hi</p><script>alert(1)</script>')
    expect(bodyHtml).not.toContain('script')
    expect(bodyHtml).not.toContain('alert')
    expect(bodyText).not.toContain('alert')
  })

  it('strips event handler attributes', () => {
    const { bodyHtml } = sanitizeBody('<p onclick="steal()">hi</p>')
    expect(bodyHtml).not.toContain('onclick')
    expect(bodyHtml).not.toContain('steal')
  })

  it('strips javascript: links but keeps safe ones with rel and target', () => {
    const { bodyHtml } = sanitizeBody(
      '<a href="javascript:steal()">bad</a><a href="https://example.com">good</a>',
    )
    expect(bodyHtml).not.toContain('javascript:')
    expect(bodyHtml).toContain('href="https://example.com"')
    expect(bodyHtml).toContain('rel="noopener noreferrer"')
    expect(bodyHtml).toContain('target="_blank"')
  })

  it('keeps text-align on allowed tags and lists intact', () => {
    const { bodyHtml } = sanitizeBody(
      '<p style="text-align: center">hi</p><ul><li>one</li><li>two</li></ul>',
    )
    expect(bodyHtml).toContain('text-align:center')
    expect(bodyHtml).toContain('<ul>')
    expect(bodyHtml).toContain('<li>one</li>')
  })

  it('strips styles other than text-align', () => {
    const { bodyHtml } = sanitizeBody('<p style="color: red; text-align: right">hi</p>')
    expect(bodyHtml).not.toContain('color')
    expect(bodyHtml).toContain('text-align:right')
  })

  it('derives plain text from the sanitized html', () => {
    const { bodyText } = sanitizeBody('<p>Hello <strong>world</strong></p>')
    expect(bodyText.trim()).toBe('Hello world')
  })

  it('removes images and iframes', () => {
    const { bodyHtml } = sanitizeBody('<img src="x.png"><iframe src="evil"></iframe><p>text</p>')
    expect(bodyHtml).not.toContain('<img')
    expect(bodyHtml).not.toContain('<iframe')
  })
})
