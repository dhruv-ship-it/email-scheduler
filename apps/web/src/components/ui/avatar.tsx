import { useState } from 'react'
import { cn } from '../../lib/cn'

type AvatarProps = {
  name: string
  src?: string | null
  className?: string
}

export function Avatar({ name, src, className }: AvatarProps) {
  // Remember which URL failed so a different photo later still gets a chance.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = Boolean(src) && src !== failedSrc

  return (
    <span
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full',
        'bg-green-500 text-small font-medium text-white',
        className,
      )}
    >
      {showImage ? (
        <img
          src={src ?? undefined}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : (
        name.trim().charAt(0).toUpperCase() || '?'
      )}
    </span>
  )
}
