/**
 * QR PNG generation (ARCHITECTURE.md §4.3, FR-12/13). Server-side PNG via the
 * `qrcode` package, generated on demand. Size presets map to pixel widths
 * (≥2 presets per FR-13).
 */
import QRCode from 'qrcode'

export type QrSize = 'sm' | 'md' | 'lg'

export const QR_SIZES: Record<QrSize, number> = {
  sm: 256,
  md: 512,
  lg: 1024,
}

export function isQrSize(v: string | null | undefined): v is QrSize {
  return v === 'sm' || v === 'md' || v === 'lg'
}

/** Generate a PNG buffer encoding `text` at the given size preset. */
export async function generateQrPng(text: string, size: QrSize = 'md'): Promise<Buffer> {
  const width = QR_SIZES[size]
  return QRCode.toBuffer(text, {
    type: 'png',
    width,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#FFFFFF' },
  })
}
