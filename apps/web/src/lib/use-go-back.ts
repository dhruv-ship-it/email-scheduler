import { useLocation, useNavigate } from 'react-router'

// A location key of "default" means this page was the first one opened, so there is
// no earlier page in the app to step back to and the fallback is used instead.
export function useGoBack(fallback: string): () => void {
  const navigate = useNavigate()
  const location = useLocation()
  return () => {
    if (location.key !== 'default') void navigate(-1)
    else void navigate(fallback)
  }
}
