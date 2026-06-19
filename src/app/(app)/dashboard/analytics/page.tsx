/**
 * Aggregate analytics (ARCHITECTURE §3.2, FR-8). Charts + accessible tables land
 * in a later pipeline slice. Placeholder keeps the Analytics nav item live.
 */
import { BarChart3 } from 'lucide-react'
import { ComingSoon } from '@/components/app/coming-soon'

export default function AnalyticsPage() {
  return (
    <ComingSoon
      title="Analytics"
      description="Clicks over time, top links, referrers, geo, and device breakdowns — each paired with an accessible table — arrive in an upcoming slice."
      icon={BarChart3}
    />
  )
}
