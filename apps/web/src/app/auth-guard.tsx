import { Navigate, Outlet } from 'react-router'
import { Button } from '../components/ui/button'
import { Spinner } from '../components/ui/spinner'
import { useMe } from '../features/auth/use-me'
import { Shortcuts } from './shortcuts'

export function AuthGuard() {
  const me = useMe()

  if (me.isPending) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        <Spinner className="size-5" />
      </div>
    )
  }
  if (me.isError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-gray-600">
        <p>Couldn&apos;t load your account.</p>
        <Button variant="outline" onClick={() => void me.refetch()}>
          Retry
        </Button>
      </div>
    )
  }
  if (!me.data) return <Navigate to="/login" replace />
  return (
    <>
      <Shortcuts />
      <Outlet />
    </>
  )
}
