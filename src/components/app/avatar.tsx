'use client'

/**
 * Avatar (DESIGN §4.12). Renders the provider image when present, otherwise an
 * initials fallback derived from name/email. Round (`--radius-full`), decorative
 * image (the surrounding control carries the accessible name).
 */
import { useState } from 'react'
import { cn } from '../lib/cn'

function initials(name?: string | null, email?: string | null): string {
  const source = (name ?? '').trim()
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean)
    const first = parts[0]?.[0] ?? ''
    const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
    return (first + last).toUpperCase() || first.toUpperCase()
  }
  const e = (email ?? '').trim()
  return e ? e[0].toUpperCase() : '?'
}

export function Avatar({
  name,
  email,
  image,
  size = 'md',
  className,
}: {
  name?: string | null
  email?: string | null
  image?: string | null
  size?: 'sm' | 'md'
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const dim = size === 'sm' ? 'h-7 w-7 text-caption' : 'h-8 w-8 text-body-sm'
  const showImage = image && !broken
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-pill bg-accent-subtle-bg font-semibold text-accent',
        dim,
        className,
      )}
      aria-hidden="true"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        initials(name, email)
      )}
    </span>
  )
}
