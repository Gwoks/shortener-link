'use client'

/**
 * Copy-to-clipboard control (DESIGN §4.3, FR-42, AC-47). On click: copies, fires
 * a "Link Copied!" toast AND flips to a transient copied state — the toast is
 * never the sole confirmation (AC-47). Falls back to a hidden-textarea + execCommand
 * when the async Clipboard API is unavailable (insecure context / older browsers).
 */
import { Check, Copy } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn'
import { Button, type ButtonProps } from '../ui/button'
import { useToast } from '../ui/toast'

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to legacy path */
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

interface CopyButtonProps extends Omit<ButtonProps, 'children' | 'onClick'> {
  value: string
  /** Visible label; omit for an icon-only button (then pass `aria-label`). */
  label?: string
  /** What to call the copied thing in the toast, e.g. "Short link". */
  toastTitle?: string
}

export function CopyButton({
  value,
  label,
  toastTitle = 'Link copied!',
  variant = 'secondary',
  size,
  className,
  'aria-label': ariaLabel,
  ...rest
}: CopyButtonProps) {
  const { success, error } = useToast()
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const onCopy = useCallback(async () => {
    const ok = await writeClipboard(value)
    if (!ok) {
      error('Couldn’t copy', 'Select the link and copy it manually.')
      return
    }
    success(toastTitle, value)
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }, [value, toastTitle, success, error])

  return (
    <Button
      type="button"
      variant={variant}
      size={size ?? (label ? 'sm' : 'icon-sm')}
      onClick={onCopy}
      aria-label={ariaLabel ?? (label ? undefined : 'Copy link')}
      className={cn(className)}
      {...rest}
    >
      {copied ? (
        <Check className="h-4 w-4 text-success-fg" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
      {label ? <span>{copied ? 'Copied!' : label}</span> : null}
      {/* Announce the state change for screen readers beyond the toast. */}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Link copied to clipboard' : ''}
      </span>
    </Button>
  )
}
