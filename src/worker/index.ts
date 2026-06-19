/**
 * Worker entrypoint (ARCHITECTURE.md §2.1, §7). Boots all background consumers
 * and the cron sweep in one process (the same image runs web OR worker by CMD).
 * Graceful shutdown on SIGINT/SIGTERM.
 */
import '@/lib/load-env'
import { runClickConsumer } from './clickConsumer'
import { runScraper } from './scraper'
import { runSweep } from './sweep'

async function main() {
  const controller = new AbortController()
  const { signal } = controller

  const shutdown = (sig: string) => {
    console.log(`[worker] received ${sig}, shutting down…`)
    controller.abort()
    // Give loops a moment to exit, then force.
    setTimeout(() => process.exit(0), 3000).unref()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  console.log('[worker] booting click consumer, scraper, and expiry sweep')
  await Promise.all([runClickConsumer(signal), runScraper(signal), runSweep(signal)])
  console.log('[worker] all loops exited')
  process.exit(0)
}

main().catch((err) => {
  console.error('[worker] fatal:', err)
  process.exit(1)
})
