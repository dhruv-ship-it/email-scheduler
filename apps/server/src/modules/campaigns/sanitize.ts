import { htmlToText } from 'html-to-text'
import sanitizeHtml from 'sanitize-html'

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
  'span',
]

const TEXT_ALIGN_STYLE = { 'text-align': [/^(left|center|right|justify)$/] }

export type SanitizedBody = { bodyHtml: string; bodyText: string }

// The compose editor's HTML is only trusted after this runs (SPEC §5.7). Everything
// not explicitly allowed here - scripts, event handlers, other styles, images,
// iframes, non-http(s)/mailto links - is stripped rather than escaped.
export function sanitizeBody(rawHtml: string): SanitizedBody {
  const bodyHtml = sanitizeHtml(rawHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      p: ['style'],
      h1: ['style'],
      h2: ['style'],
      h3: ['style'],
      li: ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedStyles: {
      p: TEXT_ALIGN_STYLE,
      h1: TEXT_ALIGN_STYLE,
      h2: TEXT_ALIGN_STYLE,
      h3: TEXT_ALIGN_STYLE,
      li: TEXT_ALIGN_STYLE,
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }, true),
    },
  })
  const bodyText = htmlToText(bodyHtml)
  return { bodyHtml, bodyText }
}
