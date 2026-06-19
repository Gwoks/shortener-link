'use client'

/**
 * Delete-link confirmation (DESIGN §4.8, USER-JOURNEY §4.5). Danger dialog that
 * names the link, requires an explicit confirm, and warns that analytics are
 * removed too (AC-14/29). Radix Dialog gives focus trap + Escape + focus restore.
 * Calls `api.deleteLink`; surfaces success/failure via toast and a recoverable
 * error envelope message (FR-37).
 */
import { useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { LinkResource } from '../lib/types'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { useToast } from '../ui/toast'

export function DeleteLinkDialog({
  link,
  open,
  onOpenChange,
  onDeleted,
}: {
  link: LinkResource | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after a successful delete so the list can drop the row. */
  onDeleted: (id: string) => void
}) {
  const { success, error } = useToast()
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    if (!link) return
    setBusy(true)
    try {
      await api.deleteLink(link.id)
      onDeleted(link.id)
      success('Link deleted', `${link.shortUrl} and its analytics were removed.`)
      onOpenChange(false)
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'
      error('Couldn’t delete link', message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        onOpenChange(next)
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Delete this link?</DialogTitle>
          <DialogDescription>
            {link ? (
              <>
                <span className="font-mono text-text-primary">{link.shortUrl}</span> will stop working
                immediately and its click analytics will be permanently deleted. This can’t be undone.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-body-sm text-text-secondary">
            Anyone who has this short link will see a “link not found” page.
          </p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="danger" loading={busy} onClick={handleDelete}>
            Delete link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
