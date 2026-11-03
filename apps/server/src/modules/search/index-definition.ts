import type { estypes } from '@elastic/elasticsearch'

export const indexSettings: estypes.IndicesIndexSettings = {
  analysis: {
    analyzer: {
      // Keeps an address as one token (apart from lowercasing) so a prefix of it matches.
      email_analyzer: { type: 'custom', tokenizer: 'uax_url_email', filter: ['lowercase'] },
    },
  },
}

export const indexMappings: estypes.MappingTypeMapping = {
  properties: {
    userId: { type: 'keyword' },
    campaignId: { type: 'keyword' },
    senderId: { type: 'keyword' },
    senderEmail: { type: 'keyword' },
    status: { type: 'keyword' },
    recipient: {
      type: 'text',
      fields: {
        email: { type: 'text', analyzer: 'email_analyzer' },
        raw: { type: 'keyword' },
      },
    },
    subject: { type: 'text', fields: { raw: { type: 'keyword', ignore_above: 256 } } },
    bodyText: { type: 'text' },
    scheduledAt: { type: 'date' },
    sentAt: { type: 'date' },
    createdAt: { type: 'date' },
  },
}
