'use client'

/**
 * Row action menu (DESIGN §5.4, USER-JOURNEY §4.5). Kebab → Edit · QR · Analytics
 * · Copy link · Delete (danger). Built on the DropdownMenu primitive for roving
 * tabindex, arrow-key nav, type-ahead, and Escape (AC-48). Edit/QR/Analytics
 * navigate to their routes (those screens land in later slices); Copy and Delete
 * are fully wired here.
 */
import { BarChart3, Copy, MoreVertical, Pencil, QrCode, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import type { LinkResource } from '../lib/types'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/menu'
import { useToast } from '../ui/toast'

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export function LinkRowActions({
  link,
  onDelete,
}: {
  link: LinkResource
  /** Opens the shared delete-confirm dialog for this link. */
  onDelete: (link: LinkResource) => void
}) {
  const router = useRouter()
  const { success, error } = useToast()

  const editHref = `/dashboard/links/${link.id}`
  const qrHref = `/dashboard/links/${link.id}?qr=1`
  const analyticsHref = `/dashboard/links/${link.id}/analytics`

  const copy = useCallback(async () => {
    const ok = await writeClipboard(link.shortUrl)
    if (ok) success('Link copied!', link.shortUrl)
    else error('Couldn’t copy', 'Select the link and copy it manually.')
  }, [link.shortUrl, success, error])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${link.shortUrl}`}>
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => router.push(editHref)}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push(qrHref)}>
          <QrCode className="h-4 w-4" aria-hidden="true" />
          QR code
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push(analyticsHref)}>
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          Analytics
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            // Keep the menu's focus-restore behavior; run copy after close.
            e.preventDefault()
            void copy()
          }}
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copy link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => onDelete(link)}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
