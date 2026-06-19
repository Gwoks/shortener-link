'use client'

/**
 * Create-link page controller (DESIGN §5.5, USER-JOURNEY §4.3). Renders the
 * shared LinkForm in "create" mode inside the standard content column. On success
 * it swaps the form for the result card (short link + copy + inline QR, §5.5
 * success) without navigating away, so the user can copy/QR or create another.
 */
import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { PageHeader } from '../app/app-shell'
import type { LinkResource } from '../lib/types'
import { LinkForm } from './link-form'
import { LinkResultCard } from './link-result-card'

export function CreateLinkPage() {
  const navigate = useNavigate()
  const [created, setCreated] = useState<LinkResource | null>(null)
  // Bump to remount the form for a clean "create another".
  const [formKey, setFormKey] = useState(0)

  return (
    <div>
      <div className="mb-2">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-sm text-body-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Links
        </Link>
      </div>
      <PageHeader
        title="New link"
        description="Shorten a URL with an optional custom alias, expiry, password, and UTM tags."
      />

      <div className="mx-auto w-full max-w-2xl">
        {created ? (
          <LinkResultCard
            link={created}
            onCreateAnother={() => {
              setCreated(null)
              setFormKey((k) => k + 1)
            }}
          />
        ) : (
          <div className="rounded-md border border-border bg-surface p-5 sm:p-6">
            <LinkForm
              key={formKey}
              mode="create"
              onCreated={(link) => setCreated(link)}
              onCancel={() => navigate('/dashboard')}
            />
          </div>
        )}
      </div>
    </div>
  )
}
