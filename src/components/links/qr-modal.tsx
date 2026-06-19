'use client'

/**
 * QR modal (DESIGN §5.9, USER-JOURNEY §4.7, FR-12/13/14, AC-17/18/19).
 * A centered dialog (bottom sheet on mobile via the shared Dialog primitive,
 * which gives focus trap + Escape + scroll lock for free) that shows the QR for a
 * link, a size-preset segmented control (≥2 presets, AC-18), a Download PNG
 * button, and the short link in mono with a copy button beside it (AC-19) for
 * people who can't scan. The QR image carries non-empty alt text, also shown
 * visibly under the image (AC-19).
 *
 * Source flexibility: pass `linkId` (owner-scoped /api/links/:id/qr) OR `code`
 * (public /api/qr/:code) so the modal works from the detail page now and the
 * list/result card later. The QR only ever encodes the public short URL.
 */
import { Download, ImageOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { qrUrlForCode, qrUrlForId } from '../lib/api'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Segmented } from '../ui/segmented'
import { Spinner } from '../ui/spinner'
import { CopyButton } from './copy-button'

type QrSize = 'sm' | 'md' | 'lg'

const SIZE_OPTIONS: Array<{ value: QrSize; label: string; px: number }> = [
  { value: 'sm', label: 'Small', px: 256 },
  { value: 'md', label: 'Medium', px: 512 },
  { value: 'lg', label: 'Large', px: 1024 },
]

export interface QrModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Full short URL (shown + copied). */
  shortUrl: string
  /** Display code, e.g. "spring-sale" — used for the alt text and download name. */
  code: string
  /** Owner-scoped source (preferred on the detail/list screens). */
  linkId?: string
}

export function QrModal({ open, onOpenChange, shortUrl, code, linkId }: QrModalProps) {
  const [size, setSize] = useState<QrSize>('md')
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)

  // Reset transient image state whenever the source (size/link) changes.
  useEffect(() => {
    setImgLoaded(false)
    setImgError(false)
  }, [size, linkId, code])

  const previewSrc = linkId ? qrUrlForId(linkId, size) : qrUrlForCode(code, size)
  const downloadHref = linkId ? qrUrlForId(linkId, size, true) : qrUrlForCode(code, size, true)
  const altText = `QR code linking to ${shortUrl}`
  const downloadName = `qr-${code}-${size}.png`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>QR code</DialogTitle>
          <DialogDescription>
            Scan to open the short link, or download a PNG to share or print.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {/* QR preview — fixed square frame so size swaps don't shift layout. */}
          <div className="flex justify-center">
            <div className="relative flex h-64 w-64 items-center justify-center overflow-hidden rounded-md border border-border bg-white p-3">
              {!imgLoaded && !imgError && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Spinner className="h-6 w-6 text-text-tertiary" />
                  <span className="sr-only">Generating QR code…</span>
                </span>
              )}
              {imgError ? (
                <div className="flex flex-col items-center gap-2 px-4 text-center text-text-tertiary">
                  <ImageOff className="h-6 w-6" aria-hidden="true" />
                  <p className="text-caption">Couldn’t load the QR code. Try a different size.</p>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- dynamic API-rendered PNG, not a static asset
                <img
                  key={previewSrc}
                  src={previewSrc}
                  alt={altText}
                  width={232}
                  height={232}
                  className="h-full w-full object-contain"
                  onLoad={() => setImgLoaded(true)}
                  onError={() => setImgError(true)}
                />
              )}
            </div>
          </div>

          {/* Visible text alternative — also the image's alt (AC-19). */}
          <p className="text-center text-caption text-text-tertiary">{altText}</p>

          {/* Size presets (≥2, AC-18). */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-caption font-medium text-text-secondary">Size</span>
            <Segmented<QrSize>
              ariaLabel="QR code size"
              options={SIZE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={size}
              onChange={setSize}
            />
            <span className="text-caption text-text-tertiary">
              {SIZE_OPTIONS.find((o) => o.value === size)!.px}×
              {SIZE_OPTIONS.find((o) => o.value === size)!.px} px PNG
            </span>
          </div>

          {/* Short link + copy, for people who can't scan (FR-14/AC-19). */}
          <div className="space-y-1.5">
            <span className="text-caption font-medium text-text-secondary">Short link</span>
            <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-subtle px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-body-sm text-text-primary" title={shortUrl}>
                {shortUrl}
              </span>
              <CopyButton value={shortUrl} variant="ghost" toastTitle="Short link copied!" aria-label="Copy short link" />
            </div>
          </div>

          {/* Download — a real link so the browser uses Content-Disposition. */}
          <Button asChild className="w-full" disabled={imgError}>
            <a href={downloadHref} download={downloadName}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Download PNG
            </a>
          </Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
