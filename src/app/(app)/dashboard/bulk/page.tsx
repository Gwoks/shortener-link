/**
 * Bulk shortening route (ARCHITECTURE §3.2, DESIGN §5.6, FR-24/25/26, AC-31/32/33/34).
 * Thin server route → the client controller renders the paste textarea, the live
 * counter + max-URL limit, and the per-row results table with copy-all + CSV
 * export. A Suspense boundary satisfies the App Router for the client island.
 */
import { Suspense } from 'react'
import { BulkPage } from '@/components/links/bulk-page'
import { PageHeader } from '@/components/app/app-shell'
import { SkeletonLines } from '@/components/ui/skeleton'

export const dynamic = 'force-dynamic'

export default function BulkRoute() {
  return (
    <Suspense
      fallback={
        <div>
          <PageHeader title="Bulk shorten" />
          <div className="mx-auto w-full max-w-3xl rounded-md border border-border bg-surface p-6">
            <SkeletonLines lines={6} />
          </div>
        </div>
      }
    >
      <BulkPage />
    </Suspense>
  )
}
