/**
 * Product wordmark — the one definition used by every navigation surface.
 */
import { Link } from 'react-router-dom'

export const PRODUCT_NAME = 'Tess'

export function Wordmark({ to = '/' }: { to?: string }) {
  return (
    <Link
      to={to}
      className="flex shrink-0 items-center gap-2 rounded-sm text-title font-bold text-text-primary"
    >
      <span
        aria-hidden="true"
        className="flex h-7 w-7 items-center justify-center rounded-sm bg-text-primary text-body-sm font-bold text-white"
      >
        T
      </span>
      {PRODUCT_NAME}
    </Link>
  )
}
