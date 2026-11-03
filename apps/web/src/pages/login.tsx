import { useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useMe } from '../features/auth/use-me'

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-4">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

export function LoginPage() {
  const me = useMe()
  const [params] = useSearchParams()
  const [note, setNote] = useState(false)

  // Hold the card back until the session check settles, so a signed-in visitor
  // never sees it flash before the redirect.
  if (me.isPending) return null
  if (me.data) return <Navigate to="/scheduled" replace />

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setNote(true)
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-[392px] max-w-full rounded-lg border border-gray-100 bg-white px-[46px] pt-11 pb-[42px]">
        <h1 className="text-center text-display leading-[34px] font-bold text-ink">Login</h1>

        <Button
          variant="soft"
          className="mt-[23px] w-full"
          onClick={() => window.location.assign('/api/auth/google')}
        >
          <GoogleMark />
          Login with Google
        </Button>
        {params.get('login') === 'failed' && (
          <p role="alert" className="mt-2 text-center text-small text-red-600">
            Google sign-in didn&apos;t complete. Try again.
          </p>
        )}

        <div className="mt-[15px] flex items-center gap-4">
          <span className="h-px flex-1 bg-gray-100" />
          <span className="text-caption tracking-wide text-placeholder">
            or sign up through email
          </span>
          <span className="h-px flex-1 bg-gray-100" />
        </div>

        <form onSubmit={onSubmit} className="mt-[24px]">
          <div className="flex flex-col gap-2.5">
            <Input type="email" placeholder="Email ID" aria-label="Email ID" autoComplete="off" />
            <Input
              type="password"
              placeholder="Password"
              aria-label="Password"
              autoComplete="off"
            />
          </div>
          <Button type="submit" className="mt-[23px] w-full">
            Login
          </Button>
          {note && (
            <p className="mt-2 text-center text-small text-muted">
              Email sign-in isn&apos;t enabled in this build. Use Google above.
            </p>
          )}
        </form>
      </div>
    </main>
  )
}
