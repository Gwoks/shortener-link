/**
 * E2E smoke for the redirect-side surfaces and API (AC-6/7/20/22/44/52). Runs
 * against the single Rust binary (E2E_BASE_URL, default http://localhost:8080),
 * which serves the API, the /:code redirect, and the static SPA. These cover
 * backend-observable behavior; the UI suite covers visual fidelity.
 *
 * Assumes the demo seed is present (demo01 active, demoex expired, demopw
 * password-protected with password "secret").
 */
import { test, expect } from '@playwright/test'

test('healthz reports ok with db (AC-52)', async ({ request }) => {
  // Redis was removed in the Rust/SQLite migration; health now reports db only.
  const res = await request.get('/api/healthz')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.status).toBe('ok')
  expect(body.db).toBe(true)
})

test('active short link 302s to its destination with no-store (AC-6)', async ({ request }) => {
  const res = await request.get('/demo01', { maxRedirects: 0 })
  expect(res.status()).toBe(302)
  expect(res.headers()['location']).toContain('example.com')
  expect(res.headers()['cache-control']).toContain('no-store')
})

test('unknown code renders the not-found dead-link page (404)', async ({ request }) => {
  const res = await request.get('/zzzzzznope', { maxRedirects: 0 })
  expect(res.status()).toBe(404)
  expect(await res.text()).toContain('not found')
})

test('expired link renders the dead-link page (410) (AC-20)', async ({ request }) => {
  const res = await request.get('/demoex', { maxRedirects: 0 })
  expect(res.status()).toBe(410)
})

test('password-protected link shows the gate (200) and unlocks (AC-22/25)', async ({ page, request }) => {
  // Gate renders.
  await page.goto('/demopw')
  await expect(page.getByText(/password protected/i)).toBeVisible()

  // Wrong password is rejected.
  const wrong = await request.post('/api/links/demopw/unlock', { data: { password: 'nope' } })
  expect(wrong.status()).toBe(401)

  // Correct password sets the unlock cookie; the subsequent redirect 302s.
  const ok = await request.post('/api/links/demopw/unlock', { data: { password: 'secret' } })
  expect(ok.status()).toBe(200)
})

test('create → redirect round trip; invalid + blocked rejected (AC-1/7/44)', async ({ request }) => {
  const created = await request.post('/api/links', { data: { url: 'https://example.com/e2e' } })
  expect(created.status()).toBe(201)
  const { link } = await created.json()
  expect(link.code).toMatch(/^[0-9a-z]{6}$/)

  const redirect = await request.get(`/${link.code}`, { maxRedirects: 0 })
  expect(redirect.status()).toBe(302)
  expect(redirect.headers()['location']).toBe('https://example.com/e2e')

  const invalid = await request.post('/api/links', { data: { url: 'javascript:alert(1)' } })
  expect(invalid.status()).toBe(422)

  const blocked = await request.post('/api/links', { data: { url: 'https://phishing.example.com/x' } })
  expect(blocked.status()).toBe(400)
})
