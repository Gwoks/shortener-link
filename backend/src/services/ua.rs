//! User-agent -> device type + browser — ported from `src/lib/ua.ts`.
//!
//! The oracle delegates to `ua-parser-js` for device/browser detection and adds
//! its own bot heuristic on top. We reproduce the oracle's bot heuristic exactly
//! and a pragmatic device/browser classifier covering the common families
//! `ua-parser-js` recognizes (mobile/tablet/desktop + major browser names).
//! Returns coarse, privacy-safe buckets only (no fingerprinting).

/// Device buckets, matching the oracle's `DeviceType`.
pub const DEVICE_MOBILE: &str = "mobile";
pub const DEVICE_TABLET: &str = "tablet";
pub const DEVICE_DESKTOP: &str = "desktop";
pub const DEVICE_BOT: &str = "bot";

/// The oracle's bot regex (case-insensitive).
fn is_bot(ua: &str) -> bool {
    let l = ua.to_lowercase();
    const NEEDLES: &[&str] = &[
        "bot",
        "crawl",
        "spider",
        "slurp",
        "bingpreview",
        "facebookexternalhit",
        "whatsapp",
        "telegram",
        "preview",
        "headless",
        "curl",
        "wget",
        "python-requests",
        "go-http",
    ];
    NEEDLES.iter().any(|n| l.contains(n))
}

/// Classify the device type from the UA (after the bot check).
/// Mirrors ua-parser-js device.type buckets, collapsing unknown to desktop.
fn device_type(ua: &str) -> &'static str {
    let l = ua.to_lowercase();
    // Tablets first (iPad, or Android without "mobile").
    let is_ipad = l.contains("ipad");
    let android_tablet = l.contains("android") && !l.contains("mobile");
    let kindle = l.contains("kindle") || l.contains("silk");
    if is_ipad || android_tablet || kindle {
        return DEVICE_TABLET;
    }
    // Mobile signals.
    if l.contains("mobile")
        || l.contains("iphone")
        || l.contains("ipod")
        || l.contains("windows phone")
        || (l.contains("android") && l.contains("mobile"))
    {
        return DEVICE_MOBILE;
    }
    DEVICE_DESKTOP
}

/// Best-effort browser name matching ua-parser-js's common outputs.
/// Order matters: more specific engines before generic ones.
fn browser_name(ua: &str) -> Option<String> {
    let l = ua.to_lowercase();
    // Edge (Chromium "Edg" and legacy "Edge").
    if l.contains("edg/") || l.contains("edge/") || l.contains("edga/") || l.contains("edgios/") {
        return Some("Edge".to_string());
    }
    // Opera.
    if l.contains("opr/") || l.contains("opera") {
        return Some("Opera".to_string());
    }
    // Samsung Internet.
    if l.contains("samsungbrowser") {
        return Some("Samsung Internet".to_string());
    }
    // Firefox (incl. iOS FxiOS).
    if l.contains("firefox") || l.contains("fxios") {
        return Some("Firefox".to_string());
    }
    // Chrome (incl. iOS CriOS) — after Edge/Opera/Samsung which also carry "chrome".
    if l.contains("crios") || l.contains("chrome") || l.contains("chromium") {
        if l.contains("chromium") {
            return Some("Chromium".to_string());
        }
        return Some("Chrome".to_string());
    }
    // Safari — only when it isn't one of the above and carries "safari".
    if l.contains("safari") && l.contains("version/") {
        return Some("Safari".to_string());
    }
    if l.contains("safari") {
        return Some("Safari".to_string());
    }
    // Internet Explorer.
    if l.contains("msie") || l.contains("trident/") {
        return Some("IE".to_string());
    }
    None
}

/// Parse a user agent into (device_type, browser_name).
/// Empty/None UA => (Some("desktop"), None); bots => (Some("bot"), None).
pub fn parse(ua: &str) -> (Option<String>, Option<String>) {
    if ua.trim().is_empty() {
        return (Some(DEVICE_DESKTOP.to_string()), None);
    }
    if is_bot(ua) {
        return (Some(DEVICE_BOT.to_string()), None);
    }
    let device = device_type(ua).to_string();
    let browser = browser_name(ua);
    (Some(device), browser)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_is_desktop_no_browser() {
        assert_eq!(parse(""), (Some("desktop".into()), None));
        assert_eq!(parse("   "), (Some("desktop".into()), None));
    }

    #[test]
    fn bots_detected() {
        assert_eq!(parse("Googlebot/2.1 (+http://www.google.com/bot.html)").0, Some("bot".into()));
        assert_eq!(parse("curl/8.1.2").0, Some("bot".into()));
        assert_eq!(parse("facebookexternalhit/1.1").0, Some("bot".into()));
        assert_eq!(parse("WhatsApp/2.0").0, Some("bot".into()));
        assert_eq!(parse("python-requests/2.31").0, Some("bot".into()));
    }

    #[test]
    fn iphone_is_mobile_safari() {
        let ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
        let (d, b) = parse(ua);
        assert_eq!(d, Some("mobile".into()));
        assert_eq!(b, Some("Safari".into()));
    }

    #[test]
    fn ipad_is_tablet() {
        let ua = "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Version/16.0 Safari/604.1";
        assert_eq!(parse(ua).0, Some("tablet".into()));
    }

    #[test]
    fn android_phone_is_mobile_chrome() {
        let ua = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
        let (d, b) = parse(ua);
        assert_eq!(d, Some("mobile".into()));
        assert_eq!(b, Some("Chrome".into()));
    }

    #[test]
    fn android_tablet() {
        let ua = "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        assert_eq!(parse(ua).0, Some("tablet".into()));
    }

    #[test]
    fn desktop_browsers() {
        let chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        assert_eq!(parse(chrome), (Some("desktop".into()), Some("Chrome".into())));
        let ff = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0";
        assert_eq!(parse(ff), (Some("desktop".into()), Some("Firefox".into())));
        let edge = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 Edg/120.0";
        assert_eq!(parse(edge), (Some("desktop".into()), Some("Edge".into())));
        let safari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
        assert_eq!(parse(safari), (Some("desktop".into()), Some("Safari".into())));
    }
}
