/**
 * Create link (ARCHITECTURE §3.2, DESIGN §5.5, FR-2). The full create form —
 * destination URL, custom alias with live availability, collapsible UTM builder
 * with live preview, optional expiry/max-clicks, and optional password — plus the
 * success result card with an inline QR. Client-driven; a Suspense boundary
 * satisfies the App Router for the client controller's hooks.
 */
import { Suspense } from 'react'
import { CreateLinkPage } from '@/components/links/create-link-page'
import { PageHeader } from '@/components/app/app-shell'
import { SkeletonLines } from '@/components/ui/skeleton'

export const dynamic = 'force-dynamic'

export default function NewLinkPage() {
  return (
    <Suspense
      fallback={
        <div>
          <PageHeader title="New link" />
          <div className="mx-auto w-full max-w-2xl rounded-md border border-border bg-surface p-6">
            <SkeletonLines lines={6} />
          </div>
        </div>
      }
    >
      <CreateLinkPage />
    </Suspense>
  )
}
