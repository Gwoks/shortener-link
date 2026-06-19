// Headless browser journey smoke test. Walks the public + authenticated journeys
// and reports any console errors / uncaught page errors (e.g. the Radix Slot crash).
// Run against a running app:  node scripts/journey-smoke.mjs [baseUrl]
import { chromium } from '@playwright/test'

const BASE = process.argv[2] || 'http://localhost:3000'
const errors = []
const results = []

function attach(page) {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push({ where: page.url(), text: m.text() })
  })
  page.on('pageerror', (e) => errors.push({ where: page.url(), text: 'PAGEERROR: ' + (e?.message || String(e)) }))
}

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()
attach(page)

async function visit(label, path, check) {
  const before = errors.length
  try {
    await page.goto(BASE + path, { waitUntil: 'load', timeout: 30000 })
  } catch (e) {
    errors.push({ where: path, text: 'NAV: ' + e.message })
  }
  await page.waitForTimeout(1200) // let client components render (Slot crashes happen here)
  let detail = ''
  if (check) {
    try {
      detail = await check()
    } catch (e) {
      detail = 'check-error: ' + e.message
    }
  }
  const errs = errors.length - before
  const ok = errs === 0 && !detail.startsWith('check-error')
  results.push({ label, path, errs, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(20)} ${path.padEnd(34)} errs=${errs}  ${detail}`)
}

// ── Public journeys ──
await visit('landing', '/', async () =>
  (await page.getByRole('button', { name: /shorten/i }).count()) > 0 ? 'hero present' : 'NO hero',
)
await visit('signin', '/signin', async () =>
  (await page.getByRole('button', { name: /sign in|create account/i }).count()) > 0 ? 'form present' : 'NO form',
)

// ── Register + sign in (real UI flow) ──
const email = `e2e_${Date.now()}@example.com`
await page.goto(BASE + '/signin?mode=signup', { waitUntil: 'load' })
await page.waitForTimeout(600)
try {
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('TestPassw0rd!')
  await page.getByRole('button', { name: /create account/i }).click()
  await page.waitForURL('**/dashboard', { timeout: 25000 })
} catch (e) {
  errors.push({ where: '/signin(signup)', text: 'AUTH FLOW: ' + e.message })
}
console.log(`  → after signup, url = ${page.url()}`)

// ── Authenticated journeys (session cookie now set on the context) ──
await visit('dashboard', '/dashboard', async () =>
  (await page.getByText(/links/i).count()) > 0 ? 'shell present' : 'rendered',
)
await visit('create-link', '/dashboard/new', async () =>
  (await page.getByRole('button', { name: /shorten|create/i }).count()) > 0 ? 'form present' : 'rendered',
)
await visit('bulk', '/dashboard/bulk', async () => 'rendered')
await visit('aggregate-analytics', '/dashboard/analytics', async () => 'rendered')
await visit('settings', '/settings', async () => 'rendered')

// ── Create a link via the API (uses the context's session cookie), then its detail + analytics ──
let code = null, id = null
try {
  const r = await page.request.post(BASE + '/api/links', { data: { url: 'https://example.com/journey-smoke' } })
  const body = await r.json().catch(() => ({}))
  const link = body.link || body
  code = link.code
  id = link.id
  console.log(`  → created link id=${id} code=${code} (status ${r.status()})`)
} catch (e) {
  errors.push({ where: 'POST /api/links', text: 'CREATE: ' + e.message })
}
if (id) {
  await visit('link-detail', `/dashboard/links/${id}`, async () => 'rendered')
  await visit('link-analytics', `/dashboard/links/${id}/analytics`, async () => 'rendered')
}
if (code) {
  const rr = await page.request.get(BASE + '/' + code, { maxRedirects: 0 }).catch(() => null)
  console.log(`  → redirect /${code} status = ${rr ? rr.status() : 'n/a'}`)
}

// ── Report ──
console.log('\n================ JOURNEY SMOKE SUMMARY ================')
const passed = results.filter((r) => r.ok).length
console.log(`journeys: ${passed}/${results.length} clean`)
const slot = errors.filter((e) => /Slot/i.test(e.text))
console.log(`total console/page errors: ${errors.length}  |  Slot errors: ${slot.length}`)
if (errors.length) {
  console.log('--- errors ---')
  for (const e of errors.slice(0, 40)) console.log(`  [${e.where}] ${e.text}`)
}
await browser.close()
process.exit(errors.length === 0 ? 0 : 1)
