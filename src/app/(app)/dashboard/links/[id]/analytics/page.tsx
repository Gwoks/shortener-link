/**
 * Per-link analytics route (ARCHITECTURE §3.2, DESIGN §5.7, FR-7). Mounts the
 * client analytics controller, which loads the link + breakdowns via the typed
 * api client and renders charts each paired with an accessible table (AC-49).
 */
import { LinkAnalyticsPage } from '@/components/analytics/link-analytics-page'

export const dynamic = 'force-dynamic'

export default function LinkAnalyticsRoute({ params }: { params: { id: string } }) {
  return <LinkAnalyticsPage id={params.id} />
}
