/**
 * Dashboard — link list (default authenticated screen). ARCHITECTURE §3.2,
 * DESIGN §5.4. The list is fully client-driven (search/filter/sort/pagination
 * via the typed api client); a Suspense boundary satisfies `useSearchParams`
 * during App Router rendering.
 */
import { Suspense } from 'react'
import { LinksPage } from '@/components/links/links-page'
import { LinksLoading } from '@/components/links/links-states'
import { PageHeader } from '@/components/app/app-shell'

export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div>
          <PageHeader title="Links" />
          <LinksLoading />
        </div>
      }
    >
      <LinksPage />
    </Suspense>
  )
}
