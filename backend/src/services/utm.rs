//! UTM assembly + preview — ported from `src/lib/utm.ts`. Pure: appends/over-
//! writes `utm_*` params on a destination URL, preserving existing query params
//! and fragment. Empty values are dropped.

/// UTM parameters; `None`/empty fields are dropped.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UtmParams {
    pub source: Option<String>,
    pub medium: Option<String>,
    pub campaign: Option<String>,
    pub term: Option<String>,
    pub content: Option<String>,
}

impl UtmParams {
    fn pairs(&self) -> [(&str, &Option<String>); 5] {
        [
            ("utm_source", &self.source),
            ("utm_medium", &self.medium),
            ("utm_campaign", &self.campaign),
            ("utm_term", &self.term),
            ("utm_content", &self.content),
        ]
    }
}

/// True if any utm field is non-empty (after trimming).
pub fn has_utm(utm: Option<&UtmParams>) -> bool {
    match utm {
        None => false,
        Some(u) => u
            .pairs()
            .iter()
            .any(|(_, v)| v.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false)),
    }
}

/// Assemble the tagged URL. Returns the input unchanged if it cannot be parsed
/// as a URL, or if `utm` is None.
pub fn assemble_utm_url(destination: &str, utm: Option<&UtmParams>) -> String {
    let utm = match utm {
        Some(u) => u,
        None => return destination.to_string(),
    };
    let mut url = match url::Url::parse(destination) {
        Ok(u) => u,
        Err(_) => return destination.to_string(),
    };

    // Collect existing pairs, then rebuild applying set-semantics for utm_*.
    let existing: Vec<(String, String)> = url
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();

    // Determine which utm params to set (non-empty trimmed).
    let mut to_set: Vec<(&str, String)> = Vec::new();
    for (param, value) in utm.pairs() {
        if let Some(v) = value {
            let t = v.trim();
            if !t.is_empty() {
                to_set.push((param, t.to_string()));
            }
        }
    }

    {
        let mut qp = url.query_pairs_mut();
        qp.clear();
        // Re-emit existing params, but skip any utm_* keys that we will overwrite
        // (set-semantics: existing utm value replaced, not duplicated).
        for (k, v) in &existing {
            if to_set.iter().any(|(p, _)| *p == k.as_str()) {
                continue;
            }
            qp.append_pair(k, v);
        }
        for (p, v) in &to_set {
            qp.append_pair(p, v);
        }
        qp.finish();
    }
    // url crate leaves a trailing '?' if query becomes empty; normalize.
    if url.query() == Some("") {
        url.set_query(None);
    }
    url.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn utm(source: &str, medium: &str, campaign: &str) -> UtmParams {
        UtmParams {
            source: if source.is_empty() { None } else { Some(source.into()) },
            medium: if medium.is_empty() { None } else { Some(medium.into()) },
            campaign: if campaign.is_empty() { None } else { Some(campaign.into()) },
            term: None,
            content: None,
        }
    }

    #[test]
    fn none_utm_returns_input() {
        assert_eq!(assemble_utm_url("https://e.com/p", None), "https://e.com/p");
    }

    #[test]
    fn malformed_url_returns_input() {
        let u = utm("s", "", "");
        assert_eq!(assemble_utm_url("not a url", Some(&u)), "not a url");
    }

    #[test]
    fn appends_params() {
        let u = utm("nl", "email", "spring");
        let out = assemble_utm_url("https://e.com/p", Some(&u));
        assert!(out.contains("utm_source=nl"));
        assert!(out.contains("utm_medium=email"));
        assert!(out.contains("utm_campaign=spring"));
    }

    #[test]
    fn preserves_existing_query_and_fragment() {
        let u = utm("nl", "", "");
        let out = assemble_utm_url("https://e.com/p?a=1#frag", Some(&u));
        assert!(out.contains("a=1"));
        assert!(out.contains("utm_source=nl"));
        assert!(out.ends_with("#frag"));
    }

    #[test]
    fn overwrites_existing_utm() {
        let u = utm("new", "", "");
        let out = assemble_utm_url("https://e.com/p?utm_source=old", Some(&u));
        assert!(out.contains("utm_source=new"));
        assert!(!out.contains("utm_source=old"));
    }

    #[test]
    fn empty_values_dropped() {
        let u = utm("", "", "");
        let out = assemble_utm_url("https://e.com/p", Some(&u));
        assert_eq!(out, "https://e.com/p");
        assert!(!has_utm(Some(&u)));
        assert!(has_utm(Some(&utm("s", "", ""))));
    }
}
