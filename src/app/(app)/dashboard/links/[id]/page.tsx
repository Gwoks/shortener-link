/**
 * Link detail / edit (ARCHITECTURE §3.2, DESIGN §5.5). Loads the link by id and
 * renders the shared edit form (reusing the create components) plus the QR modal,
 * which auto-opens from the `?qr=1` deep link used by the list row action. Client-
 * driven; a Suspense boundary satisfies `useSearchParams` during App Router render.
 */
import { Suspense } from 'react'
import { LinkDetailPage } from '@/components/links/link-detail-page'
import { PageHeader } from '@/components/app/app-shell'
import { SkeletonLines } from '@/components/ui/skeleton'

export const dynamic = 'force-dynamic'

export default function LinkDetailRoute({ params }: { params: { id: string } }) {
  return (
    <Suspense
      fallback={
        <div>
          <PageHeader title="Edit link" />
          <div className="mx-auto w-full max-w-2xl rounded-md border border-border bg-surface p-6">
            <SkeletonLines lines={6} />
          </div>
        </div>
      }
    >
      <LinkDetailPage id={params.id} />
    </Suspense>
  )
}
