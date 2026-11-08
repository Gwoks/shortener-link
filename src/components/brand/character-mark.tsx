/**
 * Avatar Character Mark (DESIGN.md) — a decorative flat face in a white circle
 * with a 2px colored ring. Faces are simple original geometric drawings.
 * Purely decorative: always aria-hidden.
 */
import { cn } from '../lib/cn'

type Ring = 'blue' | 'coral' | 'marigold'

const RING: Record<Ring, string> = {
  blue: 'border-accent',
  coral: 'border-coral',
  marigold: 'border-marigold',
}

const SIZE = { sm: 'h-10 w-10', md: 'h-12 w-12' } as const

/** Each face is a set of SVG children on a 32×32 grid. */
const FACES = [
  // content
  <>
    <circle cx="11" cy="14" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="21" cy="14" r="1.6" fill="currentColor" stroke="none" />
    <path d="M11 20q5 4.5 10 0" />
  </>,
  // delighted
  <>
    <path d="M8.5 14q2.5-3 5 0M18.5 14q2.5-3 5 0" />
    <circle cx="16" cy="21.5" r="2.4" />
  </>,
  // studious
  <>
    <circle cx="11" cy="14.5" r="3" />
    <circle cx="21" cy="14.5" r="3" />
    <path d="M14 14.5h4M13 22q3 2 6 0" />
  </>,
  // wink
  <>
    <circle cx="11" cy="14" r="1.6" fill="currentColor" stroke="none" />
    <path d="M19 14h4M11 20.5q5 4 10 0" />
  </>,
  // curious
  <>
    <circle cx="11" cy="14" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="21" cy="14" r="1.6" fill="currentColor" stroke="none" />
    <ellipse cx="16" cy="21.5" rx="2" ry="2.6" />
  </>,
]

export const CHARACTER_FACE_COUNT = FACES.length

export function CharacterMark({
  face = 0,
  ring = 'blue',
  size = 'md',
  className,
}: {
  face?: number
  ring?: Ring
  size?: keyof typeof SIZE
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-pill border-2 bg-surface text-text-primary',
        RING[ring],
        SIZE[size],
        className,
      )}
    >
      <svg
        viewBox="0 0 32 32"
        className="h-[78%] w-[78%]"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {FACES[Math.abs(face) % FACES.length]}
      </svg>
    </span>
  )
}
