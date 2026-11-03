import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useEffect } from 'react'

const STORAGE_KEY = 'tour:v1'

const STEPS: DriveStep[] = [
  {
    element: '[data-tour="compose"]',
    popover: {
      description: 'Start here. Upload a lead list, pick a start time and how fast to send.',
      side: 'right',
    },
  },
  {
    element: '[data-tour="nav"]',
    popover: {
      description:
        "Scheduled shows what's queued, including emails held back by an hourly limit. Sent shows what went out or failed.",
      side: 'right',
    },
  },
  {
    element: '[data-tour="search"]',
    popover: { description: 'Search covers recipient, subject and body.', side: 'bottom' },
  },
  {
    element: '[data-tour="user-card"]',
    popover: {
      description:
        'Open this menu to connect Slack and get a message when a sender hits its hourly cap. The queue dashboard is in here too.',
      side: 'right',
    },
  },
  {
    element: '[data-tour="first-row"]',
    popover: { description: 'Open any email to see its delivery timeline.', side: 'top' },
  },
]

function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    // Storage can be blocked; treat that as "seen" so the tour never nags on every load.
    return true
  }
}

function markTourSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // Nothing to do: the tour just may show again next visit.
  }
}

export function startTour() {
  // A target can be missing, for example the first row on a list that is still loading.
  const steps = STEPS.filter(
    (step) => typeof step.element === 'string' && document.querySelector(step.element),
  )
  if (steps.length === 0) return

  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const tour = driver({
    steps,
    animate: !calm,
    smoothScroll: !calm,
    allowClose: true,
    showProgress: false,
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    popoverClass: 'tour-popover',
    onPopoverRender: (popover) => {
      const skip = document.createElement('button')
      skip.type = 'button'
      skip.textContent = 'Skip'
      skip.className = 'tour-skip'
      skip.addEventListener('click', () => tour.destroy())
      popover.footerButtons.prepend(skip)
    },
  })
  markTourSeen()
  tour.drive()
}

// Runs the tour the first time the Scheduled page has finished loading.
export function useFirstRunTour(ready: boolean) {
  useEffect(() => {
    if (!ready || hasSeenTour()) return
    // Wait a frame so the targets have been laid out.
    const frame = requestAnimationFrame(startTour)
    return () => cancelAnimationFrame(frame)
  }, [ready])
}
