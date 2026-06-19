/**
 * On-brand clicker-facing HTML for the redirect hot path (FR-38/39, A-DEADLINK).
 *
 * WHY HTML-from-the-handler (not a React rewrite): Next 14 App Router route
 * handlers do NOT support `NextResponse.rewrite()`, and a plain redirect to a
 * page would lose the binding HTTP status codes (404/410/200, ARCHITECTURE §6.2).
 * Returning self-contained HTML with the exact status is the one approach that
 * preserves BOTH the status code AND an on-brand page. These templates are
 * intentionally minimal and token-driven; the FRONTEND agent owns final styling
 * (it can replace these strings, or the dead-link/gate React pages under
 * src/app are also available for direct navigation and styling reference).
 *
 * Security: all interpolated values are escaped; the only dynamic value injected
 * is the short code (already charset-restricted) and a fixed reason string.
 */
import { env } from './env'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const BASE_STYLE = `
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
`

function shell(title: string, bodyInner: string, bodyScript = ''): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${BASE_STYLE}</style></head>
<body><main class="card" role="main">${bodyInner}</main>${bodyScript}</body></html>`
}

const DEAD_COPY: Record<string, { title: string; body: string }> = {
  expired: { title: 'This link has expired', body: 'The owner set this short link to expire, and it is no longer active.' },
  deactivated: { title: 'This link is no longer active', body: 'The owner has deactivated this short link.' },
  'max-clicks': { title: 'This link has reached its limit', body: 'This short link hit its maximum number of clicks and is no longer active.' },
  'not-found': { title: 'Link not found', body: "We couldn't find a short link at this address. It may have been deleted or never existed." },
}

/** Render the dead-link / not-found page HTML for the given reason. */
export function deadLinkHtml(reason: string): string {
  const copy = DEAD_COPY[reason] ?? DEAD_COPY['not-found']
  return shell(
    copy.title,
    `<h1>${esc(copy.title)}</h1><p>${esc(copy.body)}</p><p><a href="${esc(env.baseUrl)}/">Shorten your own link &rarr;</a></p>`,
  )
}

/**
 * Render the password-gate page HTML. Includes a tiny inline script that POSTs
 * to the unlock endpoint and, on success, navigates back to /:code (which then
 * 302s, with the unlock cookie now set). Works without a framework (FR-39).
 */
export function gateHtml(code: string): string {
  const safeCode = esc(code)
  const script = `<script>
  (function(){
    var f=document.getElementById('gf'),i=document.getElementById('pw'),e=document.getElementById('er'),b=document.getElementById('sb');
    f.addEventListener('submit',function(ev){
      ev.preventDefault();e.textContent='';b.disabled=true;b.textContent='Unlocking…';
      fetch('/api/links/'+encodeURIComponent(${JSON.stringify(code)})+'/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:i.value})})
      .then(function(r){if(r.ok){window.location.href='/'+encodeURIComponent(${JSON.stringify(code)});return null;}return r.json().catch(function(){return null;});})
      .then(function(d){if(d===null)return;e.textContent=(d&&d.error&&d.error.message)||'Unable to unlock this link.';b.disabled=false;b.textContent='Unlock';})
      .catch(function(){e.textContent='Network error. Please try again.';b.disabled=false;b.textContent='Unlock';});
    });
  })();
  </script>`
  void safeCode // code is injected via JSON.stringify in the script (safe)
  return shell(
    'Password required',
    `<h1>This link is password protected</h1>
     <p>Enter the password to continue to the destination.</p>
     <form id="gf">
       <label for="pw">Password</label>
       <input id="pw" type="password" autocomplete="off" required aria-describedby="er">
       <p id="er" class="err" role="alert" aria-live="assertive"></p>
       <button id="sb" type="submit">Unlock</button>
     </form>`,
    script,
  )
}
