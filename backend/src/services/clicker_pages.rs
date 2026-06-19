//! On-brand clicker-facing HTML for the redirect hot path — ported verbatim
//! from `src/lib/clicker-pages.ts` (FR-38/39, A-DEADLINK).
//!
//! The markup/styling is reproduced exactly; the only dynamic values are the
//! short code (charset-restricted, injected via JSON-encoding into the script)
//! and a fixed reason string. All interpolated values are HTML-escaped.

use crate::config::Config;

/// HTML-escape, matching the oracle's `esc`.
fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// JSON-encode a string (used for safe injection into the inline <script>),
/// matching JS `JSON.stringify` for plain strings.
fn json_string(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_string())
}

const BASE_STYLE: &str = r#"
  :root{--bg:#fff;--fg:#0f172a;--muted:#64748b;--accent:#4f46e5;--border:#e2e8f0;--err:#dc2626}
  @media (prefers-color-scheme:dark){:root{--bg:#0b1120;--fg:#e2e8f0;--muted:#94a3b8;--accent:#818cf8;--border:#1e293b;--err:#f87171}}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;padding:1rem}
  .card{max-width:30rem;width:100%;border:1px solid var(--border);border-radius:14px;padding:2rem;text-align:center}
  h1{font-size:1.4rem;margin:0 0 .5rem}
  p{color:var(--muted);margin:.25rem 0 1rem}
  a{color:var(--accent)}
  label{display:block;text-align:left;font-weight:600;margin-bottom:.25rem}
  input{width:100%;padding:.6rem .75rem;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--fg);font-size:1rem}
  button{margin-top:1rem;width:100%;padding:.6rem 1rem;border:0;border-radius:8px;background:var(--accent);color:#fff;font-size:1rem;cursor:pointer}
  button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
  .err{color:var(--err);text-align:left;margin:.5rem 0 0;min-height:1.25rem}
"#;

fn shell(title: &str, body_inner: &str, body_script: &str) -> String {
    format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">\n\
<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n\
<title>{title}</title><style>{style}</style></head>\n\
<body><main class=\"card\" role=\"main\">{body}</main>{script}</body></html>",
        title = esc(title),
        style = BASE_STYLE,
        body = body_inner,
        script = body_script,
    )
}

struct DeadCopy {
    title: &'static str,
    body: &'static str,
}

fn dead_copy(reason: &str) -> DeadCopy {
    match reason {
        "expired" => DeadCopy {
            title: "This link has expired",
            body: "The owner set this short link to expire, and it is no longer active.",
        },
        "deactivated" => DeadCopy {
            title: "This link is no longer active",
            body: "The owner has deactivated this short link.",
        },
        "max-clicks" => DeadCopy {
            title: "This link has reached its limit",
            body: "This short link hit its maximum number of clicks and is no longer active.",
        },
        // "not-found" and any unknown reason fall back to not-found.
        _ => DeadCopy {
            title: "Link not found",
            body: "We couldn't find a short link at this address. It may have been deleted or never existed.",
        },
    }
}

/// Render the dead-link / not-found page HTML for the given reason.
pub fn dead_link_html(reason: &str) -> String {
    let base_url = Config::from_env().base_url;
    let copy = dead_copy(reason);
    let body = format!(
        "<h1>{title}</h1><p>{body}</p><p><a href=\"{base}/\">Shorten your own link &rarr;</a></p>",
        title = esc(copy.title),
        body = esc(copy.body),
        base = esc(&base_url),
    );
    shell(copy.title, &body, "")
}

/// Render the password-gate page HTML. Includes a tiny inline script that POSTs
/// to the unlock endpoint and, on success, navigates back to /:code.
pub fn gate_html(code: &str) -> String {
    let code_json = json_string(code);
    let script = format!(
        "<script>\n\
  (function(){{\n\
    var f=document.getElementById('gf'),i=document.getElementById('pw'),e=document.getElementById('er'),b=document.getElementById('sb');\n\
    f.addEventListener('submit',function(ev){{\n\
      ev.preventDefault();e.textContent='';b.disabled=true;b.textContent='Unlocking…';\n\
      fetch('/api/links/'+encodeURIComponent({code})+'/unlock',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{password:i.value}})}})\n\
      .then(function(r){{if(r.ok){{window.location.href='/'+encodeURIComponent({code});return null;}}return r.json().catch(function(){{return null;}});}})\n\
      .then(function(d){{if(d===null)return;e.textContent=(d&&d.error&&d.error.message)||'Unable to unlock this link.';b.disabled=false;b.textContent='Unlock';}})\n\
      .catch(function(){{e.textContent='Network error. Please try again.';b.disabled=false;b.textContent='Unlock';}});\n\
    }});\n\
  }})();\n\
  </script>",
        code = code_json,
    );
    let body = "<h1>This link is password protected</h1>\n\
     <p>Enter the password to continue to the destination.</p>\n\
     <form id=\"gf\">\n\
       <label for=\"pw\">Password</label>\n\
       <input id=\"pw\" type=\"password\" autocomplete=\"off\" required aria-describedby=\"er\">\n\
       <p id=\"er\" class=\"err\" role=\"alert\" aria-live=\"assertive\"></p>\n\
       <button id=\"sb\" type=\"submit\">Unlock</button>\n\
     </form>";
    shell("Password required", body, &script)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dead_html_has_correct_copy_per_reason() {
        let h = dead_link_html("expired");
        assert!(h.contains("This link has expired"));
        assert!(h.contains("no longer active."));

        assert!(dead_link_html("deactivated").contains("This link is no longer active"));
        assert!(dead_link_html("max-clicks").contains("This link has reached its limit"));

        let nf = dead_link_html("not-found");
        assert!(nf.contains("Link not found"));
        // unknown reason falls back to not-found
        assert!(dead_link_html("bogus").contains("Link not found"));
    }

    #[test]
    fn dead_html_is_well_formed_shell() {
        let h = dead_link_html("expired");
        assert!(h.starts_with("<!doctype html>"));
        assert!(h.contains("<main class=\"card\" role=\"main\">"));
        assert!(h.contains("Shorten your own link &rarr;"));
        assert!(h.ends_with("</body></html>"));
    }

    #[test]
    fn gate_html_contains_form_and_script() {
        let h = gate_html("abc123");
        assert!(h.contains("This link is password protected"));
        assert!(h.contains("id=\"gf\""));
        assert!(h.contains("/api/links/"));
        assert!(h.contains("\"abc123\"")); // code injected via JSON.stringify
        assert!(h.contains("<title>Password required</title>"));
    }

    #[test]
    fn gate_html_escapes_code_in_json() {
        // A code with a quote should be JSON-escaped, not break the script.
        let h = gate_html("a\"b");
        assert!(h.contains("\"a\\\"b\""));
    }

    #[test]
    fn esc_escapes_all_entities() {
        assert_eq!(esc("<a href=\"x\">&'"), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
    }
}
