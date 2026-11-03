// config/env.ts validates the environment when it is imported and exits on a missing
// required variable. CI has no .env, so unit tests fall back to fixed test values.
// Anything already set, from .env or the shell, wins over these.
process.env.SESSION_SECRET ??= 'unit-test-session-secret-with-more-than-32-characters'
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64')
process.env.GOOGLE_CLIENT_ID ??= 'unit-test-google-client-id'
process.env.GOOGLE_CLIENT_SECRET ??= 'unit-test-google-client-secret'
