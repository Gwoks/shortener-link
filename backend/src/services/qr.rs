//! QR PNG generation — ported from `src/lib/qr.ts`. Server-side PNG via the
//! `qrcode` + `image` crates, generated on demand. Size presets map to pixel
//! widths (>=2 presets per FR-13). Error-correction level M, 2-module quiet zone,
//! black-on-white — matching the oracle's options.

use anyhow::Context;
use image::{ImageBuffer, Luma};
use qrcode::{EcLevel, QrCode};

/// Size presets in pixel widths, matching `QR_SIZES` in qr.ts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QrSize {
    Sm,
    Md,
    Lg,
}

impl QrSize {
    pub fn width(&self) -> u32 {
        match self {
            QrSize::Sm => 256,
            QrSize::Md => 512,
            QrSize::Lg => 1024,
        }
    }

    /// Parse the preset string (`"sm"|"md"|"lg"`), defaulting to `Md` for None.
    pub fn parse(v: Option<&str>) -> Option<QrSize> {
        match v {
            Some("sm") => Some(QrSize::Sm),
            Some("md") => Some(QrSize::Md),
            Some("lg") => Some(QrSize::Lg),
            _ => None,
        }
    }
}

const MARGIN_MODULES: u32 = 2; // quiet zone (matches oracle `margin: 2`)

/// Generate a PNG buffer encoding `data` at the default (md) size.
pub fn png(data: &str) -> anyhow::Result<Vec<u8>> {
    png_sized(data, QrSize::Md)
}

/// Generate a PNG buffer encoding `data` at the given size preset.
/// Error-correction level M, black-on-white, 2-module quiet zone.
pub fn png_sized(data: &str, size: QrSize) -> anyhow::Result<Vec<u8>> {
    let code = QrCode::with_error_correction_level(data.as_bytes(), EcLevel::M)
        .context("failed to build QR code")?;

    let modules = code.width() as u32; // count of modules per side (no quiet zone)
    let total_modules = modules + MARGIN_MODULES * 2;

    // Scale modules up to approximately the requested pixel width.
    let target = size.width();
    let scale = (target / total_modules).max(1);
    let img_size = total_modules * scale;

    // Render: dark modules -> 0 (black), light -> 255 (white).
    let colors = code.to_colors();
    let mut img: ImageBuffer<Luma<u8>, Vec<u8>> =
        ImageBuffer::from_pixel(img_size, img_size, Luma([255u8]));

    for my in 0..modules {
        for mx in 0..modules {
            let idx = (my * modules + mx) as usize;
            let dark = colors[idx] == qrcode::Color::Dark;
            if !dark {
                continue;
            }
            let px0 = (mx + MARGIN_MODULES) * scale;
            let py0 = (my + MARGIN_MODULES) * scale;
            for dy in 0..scale {
                for dx in 0..scale {
                    img.put_pixel(px0 + dx, py0 + dy, Luma([0u8]));
                }
            }
        }
    }

    let mut out = std::io::Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageFormat::Png)
        .context("failed to encode PNG")?;
    Ok(out.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn is_png(bytes: &[u8]) -> bool {
        bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a])
    }

    #[test]
    fn produces_valid_png_bytes() {
        let bytes = png("https://example.com/abc123").unwrap();
        assert!(!bytes.is_empty());
        assert!(is_png(&bytes));
    }

    #[test]
    fn sizes_map_to_widths() {
        assert_eq!(QrSize::Sm.width(), 256);
        assert_eq!(QrSize::Md.width(), 512);
        assert_eq!(QrSize::Lg.width(), 1024);
    }

    #[test]
    fn parse_size_presets() {
        assert_eq!(QrSize::parse(Some("sm")), Some(QrSize::Sm));
        assert_eq!(QrSize::parse(Some("lg")), Some(QrSize::Lg));
        assert_eq!(QrSize::parse(Some("xl")), None);
        assert_eq!(QrSize::parse(None), None);
    }

    #[test]
    fn larger_preset_yields_more_bytes() {
        let sm = png_sized("hello world", QrSize::Sm).unwrap();
        let lg = png_sized("hello world", QrSize::Lg).unwrap();
        assert!(lg.len() > sm.len());
    }
}
