/**
 * Public landing page (DESIGN.md §Layout): centered hero stack — character
 * marks → display headline with a highlight pill → serif subhead → the shorten
 * form as the "product mockup" card — then an accent feature grid and a
 * midnight call-to-action band, separated by 80px section gaps.
 */
import { BarChart3, CalendarClock, Link2, QrCode, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CharacterMark } from '../brand/character-mark'
import { PRODUCT_NAME } from '../brand/wordmark'
import { GuestHero } from '../guest/guest-hero'
import { cn } from '../lib/cn'
import { Button } from '../ui/button'
import { Card, type CardTone } from '../ui/card'
import { HighlightPill } from '../ui/highlight-pill'

const MARKS = [
  { face: 0, ring: 'blue' },
  { face: 1, ring: 'coral' },
  { face: 2, ring: 'marigold' },
  { face: 3, ring: 'blue' },
  { face: 4, ring: 'coral' },
] as const

interface Feature {
  icon: LucideIcon
  title: string
  body: string
  tone: CardTone
  wide?: boolean
}

const FEATURES: Feature[] = [
  {
    icon: BarChart3,
    title: 'Know who clicks',
    body: 'Clicks, unique visitors, referrers, countries, and devices for every link — rolled up daily and private by default.',
    tone: 'marigold',
    wide: true,
  },
  {
    icon: QrCode,
    title: 'QR codes, ready to print',
    body: 'Every short link comes with a crisp QR code in three sizes.',
    tone: 'sky',
  },
  {
    icon: Link2,
    title: 'Your own alias',
    body: 'Swap the random code for a memorable one, checked live as you type.',
    tone: 'peach',
  },
  {
    icon: CalendarClock,
    title: 'Expiry, limits, and passwords',
    body: 'Retire a link on a date, after a number of clicks, or put it behind a password.',
    tone: 'white',
    wide: true,
  },
]

function Hero() {
  return (
    <section className="px-4 pt-16 text-center sm:px-6 sm:pt-20">
      <div className="flex justify-center -space-x-2">
        {MARKS.map((mark) => (
          <CharacterMark key={mark.face} face={mark.face} ring={mark.ring} />
        ))}
      </div>
      <h1 className="mx-auto mt-8 max-w-4xl text-balance text-heading-lg text-text-primary sm:text-display-sm lg:text-display">
        <HighlightPill>Shorten</HighlightPill> long links.
        <br />
        Share them anywhere.
      </h1>
      <p className="mx-auto mt-6 max-w-xl font-serif text-lede text-text-secondary">
        Free, fast, and private. No account needed — paste a URL and get a short link in a second.
      </p>
      <div className="mx-auto mt-10 max-w-guest-hero text-left">
        <GuestHero />
      </div>
    </section>
  )
}

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon
  return (
    <Card
      as="li"
      tone={feature.tone}
      className={cn('flex flex-col gap-4 sm:p-8', feature.wide && 'md:col-span-2')}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-surface text-text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <h3 className="text-subheading">{feature.title}</h3>
        <p className="mt-2 max-w-xl text-body opacity-80">{feature.body}</p>
      </div>
    </Card>
  )
}

function Features() {
  return (
    <section
      aria-labelledby="features-heading"
      className="mx-auto mt-section w-full max-w-content px-4 sm:px-6"
    >
      <h2
        id="features-heading"
        className="text-center text-heading-sm text-text-primary sm:text-heading"
      >
        Everything a link needs
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-center font-serif text-lede text-text-secondary">
        Sign up free to keep your links for good and unlock the rest.
      </p>
      <ul className="mt-10 grid gap-4 md:grid-cols-2">
        {FEATURES.map((feature) => (
          <FeatureCard key={feature.title} feature={feature} />
        ))}
      </ul>
    </section>
  )
}

function CallToAction() {
  return (
    <section className="mx-auto my-section w-full max-w-content px-4 sm:px-6">
      <Card tone="dark" className="flex flex-col items-center px-6 py-16 text-center sm:py-20">
        <h2 className="text-heading-sm sm:text-heading">Keep every link, for good.</h2>
        <p className="mt-3 max-w-lg font-serif text-lede text-white/80">
          Guest links expire after 24 hours. Create a free account to claim them and track every
          click.
        </p>
        <Button asChild variant="secondary" size="lg" className="mt-8">
          <Link to="/signin?mode=signup">Create a free account</Link>
        </Button>
      </Card>
    </section>
  )
}

export function LandingPage() {
  return (
    <>
      <Hero />
      <Features />
      <CallToAction />
      <footer className="pb-10 text-center text-caption text-text-tertiary">
        © {new Date().getFullYear()} {PRODUCT_NAME}
      </footer>
    </>
  )
}
