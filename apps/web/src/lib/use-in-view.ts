import { useEffect, useRef } from 'react'

// Calls onVisible each time the returned element scrolls into view. Pass `enabled`
// false to stop observing, e.g. while a page is already loading.
export function useInView<T extends Element>(onVisible: () => void, enabled: boolean) {
  const ref = useRef<T | null>(null)
  const callback = useRef(onVisible)

  useEffect(() => {
    callback.current = onVisible
  })

  useEffect(() => {
    const node = ref.current
    if (!enabled || !node) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) callback.current()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled])

  return ref
}
