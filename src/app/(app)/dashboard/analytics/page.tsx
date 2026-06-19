/**
 * Aggregate analytics route (ARCHITECTURE §3.2, DESIGN §5.8, FR-8). Mounts the
 * client controller, which sums clicks/uniques/top-links across the user's links
 * via the summary endpoint and pairs each chart with an accessible table (AC-49).
 */
import { SummaryAnalyticsPage } from '@/components/analytics/summary-analytics-page'

export const dynamic = 'force-dynamic'

export default function AnalyticsRoute() {
  return <SummaryAnalyticsPage />
}
