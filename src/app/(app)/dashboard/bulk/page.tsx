/**
 * Bulk shortening (ARCHITECTURE §3.2, FR-24). Bulk paste + results table + CSV
 * export land in a later pipeline slice. Placeholder keeps the Bulk nav item live.
 */
import { Layers } from 'lucide-react'
import { ComingSoon } from '@/components/app/coming-soon'

export default function BulkPage() {
  return (
    <ComingSoon
      title="Bulk"
      description="Paste many URLs at once, review per-row results, and export a CSV — arrives in an upcoming slice."
      icon={Layers}
    />
  )
}
