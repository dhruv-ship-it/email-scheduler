import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router'
import { ComposePage } from '../pages/compose'
import { EmailDetailPage } from '../pages/email-detail'
import { LoginPage } from '../pages/login'
import { MailListPage } from '../pages/mail-list'
import { AppShell } from './app-shell'
import { AuthGuard } from './auth-guard'

// Keeps the query string, because Slack sends the browser back to "/?slack=..." and
// the result toast reads it after this redirect.
function RedirectToScheduled() {
  const { search } = useLocation()
  return <Navigate to={{ pathname: '/scheduled', search }} replace />
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/scheduled', element: <MailListPage tab="scheduled" /> },
          { path: '/sent', element: <MailListPage tab="sent" /> },
        ],
      },
      { path: '/compose', element: <ComposePage /> },
      { path: '/emails/:id', element: <EmailDetailPage /> },
    ],
  },
  { path: '*', element: <RedirectToScheduled /> },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
