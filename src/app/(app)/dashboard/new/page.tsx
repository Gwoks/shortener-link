/**
 * Create link (ARCHITECTURE §3.2, FR-2). Full create form + UTM builder + alias
 * + expiry/password land in a later pipeline slice. Placeholder keeps the
 * "+ New link" CTA navigable from the shell and the empty state.
 */
import { Plus } from 'lucide-react'
import { ComingSoon } from '@/components/app/coming-soon'

export default function NewLinkPage() {
  return (
    <ComingSoon
      title="New link"
      description="The create form — custom alias, expiry, password, and UTM builder — arrives in an upcoming slice."
      icon={Plus}
    />
  )
}
