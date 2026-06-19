/**
 * Per-link analytics (ARCHITECTURE §3.2, FR-7). Charts + accessible tables land
 * in a later pipeline slice. Placeholder keeps row "Analytics" and the row-click
 * navigation working from the list.
 */
import { BarChart3 } from 'lucide-react'
import { ComingSoon } from '@/components/app/coming-soon'

export default function LinkAnalyticsPage() {
  return (
    <ComingSoon
      title="Link analytics"
      description="Per-link clicks over time, referrers, geo, and device breakdowns arrive in an upcoming slice."
      icon={BarChart3}
    />
  )
}
