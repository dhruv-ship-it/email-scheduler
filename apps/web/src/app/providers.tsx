import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Toaster } from 'sonner'
import { TooltipProvider } from '../components/ui/tooltip'
import { queryClient } from '../lib/query-client'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {children}
        <Toaster position="bottom-center" toastOptions={{ className: 'text-body' }} />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
