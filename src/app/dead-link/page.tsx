/**
 * On-brand dead-link / not-found page (FR-38, A-DEADLINK, AC-20/21/29/41).
 * Backend scaffold — FRONTEND owns final styling. The redirect handler rewrites
 * to this page with the correct HTTP status and a `reason` query param.
 */
const COPY: Record<string, { title: string; body: string }> = {
  expired: {
    title: 'This link has expired',
    body: 'The owner set this short link to expire, and it is no longer active.',
  },
  deactivated: {
    title: 'This link is no longer active',
    body: 'The owner has deactivated this short link.',
  },
  'max-clicks': {
    title: 'This link has reached its limit',
    body: 'This short link hit its maximum number of clicks and is no longer active.',
  },
  'not-found': {
    title: 'Link not found',
    body: "We couldn't find a short link at this address. It may have been deleted or never existed.",
  },
}

export default function DeadLinkPage({ searchParams }: { searchParams: { reason?: string } }) {
  const reason = searchParams.reason ?? 'not-found'
  const copy = COPY[reason] ?? COPY['not-found']
  return (
    <main className="center-card" role="main">
      <h1>{copy.title}</h1>
      <p style={{ color: 'var(--muted)' }}>{copy.body}</p>
      <p>
        <a href="/">Shorten your own link &rarr;</a>
      </p>
    </main>
  )
}
