import type { SlackStatus } from '@scheduler/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { queryKeys } from '../../lib/query-keys'

export function useSlackStatus() {
  return useQuery({
    queryKey: queryKeys.slack,
    queryFn: () => api.get<SlackStatus>('/api/integrations/slack'),
    staleTime: 30_000,
  })
}

export function useSendSlackTest() {
  return useMutation({
    mutationFn: () => api.post<void>('/api/integrations/slack/test'),
    onSuccess: () => toast.success('Test message sent.'),
    onError: (error) => toast.error(error.message),
  })
}

export function useDisconnectSlack() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete<void>('/api/integrations/slack'),
    onSuccess: () => {
      toast.success('Slack disconnected.')
      void client.invalidateQueries({ queryKey: queryKeys.slack })
    },
    onError: (error) => toast.error(error.message),
  })
}

const RETURN_MESSAGES: Record<string, { kind: 'success' | 'error'; text: string }> = {
  connected: { kind: 'success', text: 'Slack connected.' },
  denied: {
    kind: 'error',
    text: "Slack wasn't connected. You can try again from the account menu.",
  },
  error: { kind: 'error', text: "Couldn't connect Slack. Try again from the account menu." },
}

// Slack sends the browser back with ?slack=<result>; show it once and clean the URL.
export function useSlackReturnToast() {
  const [params, setParams] = useSearchParams()
  const client = useQueryClient()
  const result = params.get('slack')

  useEffect(() => {
    if (result === null) return
    const message = RETURN_MESSAGES[result]
    if (message) {
      // A fixed id keeps StrictMode's double-run of this effect from stacking two toasts.
      if (message.kind === 'success') toast.success(message.text, { id: 'slack-return' })
      else toast.error(message.text, { id: 'slack-return' })
    }
    void client.invalidateQueries({ queryKey: queryKeys.slack })
    const next = new URLSearchParams(params)
    next.delete('slack')
    setParams(next, { replace: true })
  }, [result, params, setParams, client])
}
