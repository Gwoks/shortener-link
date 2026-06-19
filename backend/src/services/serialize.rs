//! Link row → client `LinkResource` JSON (spec §5.2; oracle src/lib/serialize.ts).
//! `password_hash` is NEVER serialized — only `hasPassword: bool`.

use serde_json::{json, Value};

use crate::models::Link;

pub fn short_url_for_code(base_url: &str, code: &str) -> String {
    format!("{base_url}/{code}")
}

/// Matches `LinkResource` in src/components/lib/types.ts exactly (camelCase keys).
/// `display_code` prefers the original-case alias when present.
pub fn serialize_link(link: &Link, base_url: &str) -> Value {
    let display_code = link
        .alias_display
        .clone()
        .unwrap_or_else(|| link.code.clone());
    json!({
        "id": link.id,
        "code": display_code,
        "shortUrl": short_url_for_code(base_url, &display_code),
        "destinationUrl": link.destination_url,
        "status": link.status,
        "metaStatus": link.meta_status,
        "metaTitle": link.meta_title,
        "metaDescription": link.meta_description,
        "hasPassword": link.password_hash.is_some(),
        "expiresAt": link.expires_at,
        "maxClicks": link.max_clicks,
        "clickCount": link.click_count,
        "isGuest": link.is_guest,
        "createdAt": link.created_at,
        "updatedAt": link.updated_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Link;

    fn sample() -> Link {
        Link {
            id: "c1".into(),
            code: "abc123".into(),
            alias_display: Some("AbC123".into()),
            destination_url: "https://example.com".into(),
            owner_id: Some("u1".into()),
            is_guest: false,
            guest_key: None,
            status: "ACTIVE".into(),
            meta_status: "READY".into(),
            meta_title: Some("T".into()),
            meta_description: None,
            password_hash: Some("argon2...".into()),
            expires_at: None,
            max_clicks: None,
            click_count: 3,
            created_at: "2026-06-19T00:00:00.000Z".into(),
            updated_at: "2026-06-19T00:00:00.000Z".into(),
        }
    }

    #[test]
    fn serializes_resource_shape_without_password_hash() {
        let v = serialize_link(&sample(), "https://sho.rt");
        assert_eq!(v["code"], "AbC123"); // alias display preferred
        assert_eq!(v["shortUrl"], "https://sho.rt/AbC123");
        assert_eq!(v["hasPassword"], true);
        assert_eq!(v["expiresAt"], Value::Null);
        assert_eq!(v["clickCount"], 3);
        assert!(v.get("passwordHash").is_none());
    }
}
