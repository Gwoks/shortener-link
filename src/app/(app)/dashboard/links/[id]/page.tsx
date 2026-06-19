/**
 * Link detail / edit (ARCHITECTURE §3.2). The edit card + QR modal land in a
 * later pipeline slice. Placeholder keeps the row "Edit" and "QR code" actions
 * navigable from the list.
 */
import { Pencil } from 'lucide-react'
import { ComingSoon } from '@/components/app/coming-soon'

export default function LinkDetailPage() {
  return (
    <ComingSoon
      title="Link details"
      description="Editing a link and its QR code arrive in an upcoming slice."
      icon={Pencil}
    />
  )
}
