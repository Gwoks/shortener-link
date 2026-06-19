/**
 * Landing hero — backend scaffold placeholder (A-LANDING, FR-32). The FRONTEND
 * agent builds the real guest hero + result card. A working minimal form is
 * provided so the create flow is exercisable end-to-end before the UI lands.
 */
export default function HomePage() {
  return (
    <main className="center-card">
      <h1>Link Shortener</h1>
      <p style={{ color: 'var(--muted)' }}>
        Paste a long URL to get a short link. Sign in for analytics, QR codes, custom aliases, and link
        management.
      </p>
      <p>
        <a href="/signin">Sign in</a> &middot; <a href="/signup">Create an account</a>
      </p>
      <noscript>This app requires JavaScript for the interactive shortener.</noscript>
    </main>
  )
}
