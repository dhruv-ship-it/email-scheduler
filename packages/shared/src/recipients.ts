// No lookahead/lookbehind, kept deliberately plain: this gates what we accept as a
// recipient and also what we pull out of free-form CSV/text cells.
const EMAIL_PATTERN =
  "[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+"

export const EMAIL_REGEX = new RegExp(`^${EMAIL_PATTERN}$`)
const EMAIL_SEARCH_REGEX = new RegExp(EMAIL_PATTERN, 'g')

export type NormalizeRecipientsResult = {
  accepted: string[]
  duplicates: number
  invalid: number
}

export function normalizeRecipients(raw: readonly string[]): NormalizeRecipientsResult {
  const seen = new Set<string>()
  const accepted: string[] = []
  let duplicates = 0
  let invalid = 0
  for (const entry of raw) {
    const candidate = entry.trim().toLowerCase()
    if (!EMAIL_REGEX.test(candidate)) {
      invalid += 1
      continue
    }
    if (seen.has(candidate)) {
      duplicates += 1
      continue
    }
    seen.add(candidate)
    accepted.push(candidate)
  }
  return { accepted, duplicates, invalid }
}

// Pulls every email-shaped substring out of free text, e.g. a CSV cell that has a
// name and address together. Matches are lowercased but not deduped or validated
// against each other; callers run normalizeRecipients over the combined results.
export function extractEmails(text: string): string[] {
  return [...text.matchAll(EMAIL_SEARCH_REGEX)].map((match) => match[0].toLowerCase())
}
