const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#39;': "'",
  '&#x2F;': '/',
}

function decode(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#x27|#39|#x2F);/g, (entity) => ENTITIES[entity] ?? entity)
}

// Elasticsearch returns fragments with the html encoder: every character is escaped
// except the <mark> tags it adds. Only those two tags are honoured here and the rest
// is rendered as plain text, so nothing from an email body can become markup.
export function Highlighted({ html }: { html: string }) {
  let marked = false
  const nodes = html.split(/(<mark>|<\/mark>)/).map((part, index) => {
    if (part === '<mark>') {
      marked = true
      return null
    }
    if (part === '</mark>') {
      marked = false
      return null
    }
    if (!part) return null
    const text = decode(part)
    return marked ? (
      <mark key={index} className="rounded-sm bg-yellow-100 text-inherit">
        {text}
      </mark>
    ) : (
      <span key={index}>{text}</span>
    )
  })
  return <>{nodes}</>
}
