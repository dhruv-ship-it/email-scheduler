import { extractEmails } from '@scheduler/shared'
import Papa from 'papaparse'

export type ParsedRecipients = {
  addresses: string[]
  duplicates: number
  rowsWithoutEmail: number
}

// Streams the source in chunks so a large list never has to sit in memory as one
// string. Every cell of every row is searched, since lists put the address next to
// a name or in a column of its own.
export function parseRecipientSource(
  source: File | string,
  alreadyAdded: readonly string[] = [],
): Promise<ParsedRecipients> {
  return new Promise((resolve, reject) => {
    const seen = new Set(alreadyAdded.map((address) => address.toLowerCase()))
    const addresses: string[] = []
    let duplicates = 0
    let rowsWithoutEmail = 0

    Papa.parse<string[]>(source as File, {
      skipEmptyLines: 'greedy',
      chunk: (chunk) => {
        for (const row of chunk.data) {
          const found = row.flatMap((cell) => extractEmails(String(cell)))
          if (found.length === 0) {
            rowsWithoutEmail += 1
            continue
          }
          for (const address of found) {
            if (seen.has(address)) {
              duplicates += 1
              continue
            }
            seen.add(address)
            addresses.push(address)
          }
        }
      },
      complete: () => resolve({ addresses, duplicates, rowsWithoutEmail }),
      error: (error: Error) => reject(error),
    })
  })
}
