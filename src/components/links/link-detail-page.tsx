/**
 * Link detail / edit controller (DESIGN §5.5, USER-JOURNEY §4.3). Loads the link
 * through the shared `useLink` hook, then renders the shared LinkForm in "edit"
 * mode. Honors `?qr=1` (from the list's row action) by auto-opening the QR modal
 * once, and offers Copy / QR / Analytics header actions.
 */
import { BarChart3, QrCode } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLink } from '@/data/links'
import { PageHeader } from '../app/app-shell'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { SkeletonLines } from '../ui/skeleton'
import { CopyButton } from './copy-button'
import { LinkForm } from './link-form'
import { BackLink, LinkLoadError, LinkSummaryCard } from './link-page-parts'
import { QrModal } from './qr-modal'

const PAGE_TITLE = 'Edit link'

export function LinkDetailPage({ id }: { id: string }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data: link, error, isPending, refetch } = useLink(id)
  const [qrOpen, setQrOpen] = useState(false)
  // Only auto-open the QR modal once per mount (from the ?qr=1 deep link).
  const autoOpened = useRef(false)

  useEffect(() => {
    if (link && !autoOpened.current && searchParams.get('qr') === '1') {
      autoOpened.current = true
      setQrOpen(true)
    }
  }, [link, searchParams])

  if (isPending) {
    return (
      <div>
        <BackLink />
        <PageHeader title={PAGE_TITLE} />
        <Card className="mx-auto w-full max-w-form">
          <span className="sr-only" role="status">
            Loading link…
          </span>
          <SkeletonLines lines={6} />
        </Card>
      </div>
    )
  }

  if (!link) {
    return (
      <div>
        <BackLink />
        <PageHeader title={PAGE_TITLE} />
        <LinkLoadError error={error} onRetry={() => void refetch()} />
      </div>
    )
  }

  return (
    <div>
      <BackLink />
      <PageHeader
        title={PAGE_TITLE}
        actions={
          <>
            <CopyButton value={link.shortUrl} label="Copy" toastTitle="Short link copied!" />
            <Button variant="secondary" onClick={() => setQrOpen(true)}>
              <QrCode className="h-4 w-4" aria-hidden="true" />
              QR code
            </Button>
            <Button asChild variant="ghost">
              <Link to={`/dashboard/links/${link.id}/analytics`}>
                <BarChart3 className="h-4 w-4" aria-hidden="true" />
                Analytics
              </Link>
            </Button>
          </>
        }
      />

      <div className="mx-auto w-full max-w-form space-y-4">
        <LinkSummaryCard link={link} />
        <Card className="sm:p-8">
          <LinkForm
            mode="edit"
            link={link}
            onUpdated={() => navigate('/dashboard')}
            onCancel={() => navigate('/dashboard')}
          />
        </Card>
      </div>

      <QrModal
        open={qrOpen}
        onOpenChange={setQrOpen}
        shortUrl={link.shortUrl}
        code={link.code}
        linkId={link.id}
      />
    </div>
  )
}
