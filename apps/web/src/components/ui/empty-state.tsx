import type { ReactNode } from 'react'

type EmptyStateProps = { title: string; children?: ReactNode }

export function EmptyState({ title, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
      <p className="text-body text-gray-600">{title}</p>
      {children}
    </div>
  )
}
