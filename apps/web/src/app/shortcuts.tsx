import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'

const TYPING_TARGET = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]'

// c opens compose and / focuses the search pill. Both are ignored while the user
// is typing or holding a modifier, so they never swallow ordinary text.
export function Shortcuts() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.target instanceof Element && event.target.closest(TYPING_TARGET)) return

      if (event.key === 'c' && location.pathname !== '/compose') {
        event.preventDefault()
        void navigate('/compose')
      } else if (event.key === '/') {
        const search = document.querySelector<HTMLInputElement>('[data-search-input]')
        if (search) {
          event.preventDefault()
          search.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, location.pathname])

  return null
}
