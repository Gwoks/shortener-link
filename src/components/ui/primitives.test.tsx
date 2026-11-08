import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InlineAlert } from './alert'
import { Button } from './button'
import { Card } from './card'
import { HighlightPill } from './highlight-pill'
import { StateCard } from './state-card'

describe('Card', () => {
  it('renders a hairline white card with no shadow by default', () => {
    render(<Card data-testid="card">Body</Card>)
    const card = screen.getByTestId('card')
    expect(card).toHaveClass('rounded-md', 'border', 'bg-surface', 'p-6')
    expect(card.className).not.toMatch(/shadow/)
  })

  it('supports accent tones, padding, and a semantic element', () => {
    render(
      <Card as="section" tone="dark" padding="sm" aria-label="cta">
        CTA
      </Card>,
    )
    const card = screen.getByRole('region', { name: 'cta' })
    expect(card.tagName).toBe('SECTION')
    expect(card).toHaveClass('bg-midnight', 'text-white', 'p-4')
    expect(card).not.toHaveClass('border')
  })
})

describe('StateCard', () => {
  it('announces errors with role=alert and renders actions', () => {
    render(
      <StateCard
        tone="error"
        title="Couldn’t load"
        description="Try again."
        actions={<button type="button">Retry</button>}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load')
    expect(screen.getByText('Try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('renders an empty state without alert semantics', () => {
    render(<StateCard title="Nothing here" />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument()
  })
})

describe('Button', () => {
  it('maps variants to the DESIGN.md button styles', () => {
    render(
      <>
        <Button>Primary</Button>
        <Button variant="secondary">Ghost CTA</Button>
        <Button variant="outline">Outlined</Button>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Primary' })).toHaveClass('bg-accent', 'rounded-sm')
    expect(screen.getByRole('button', { name: 'Ghost CTA' })).toHaveClass(
      'bg-accent-subtle-bg',
      'text-accent',
    )
    expect(screen.getByRole('button', { name: 'Outlined' })).toHaveClass('border-ink', 'rounded-xs')
  })

  it('marks loading buttons busy and disabled', () => {
    render(<Button loading>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
})

describe('InlineAlert', () => {
  it('uses alert semantics for danger and status for info', () => {
    render(
      <>
        <InlineAlert id="err">Blocked</InlineAlert>
        <InlineAlert tone="info">Heads up</InlineAlert>
      </>,
    )
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'err')
    expect(screen.getByRole('status')).toHaveTextContent('Heads up')
  })
})

describe('HighlightPill', () => {
  it('wraps a word in a pill with the chosen accent', () => {
    render(<HighlightPill tone="marigold">Shorten</HighlightPill>)
    expect(screen.getByText('Shorten')).toHaveClass('rounded-pill', 'bg-marigold')
  })
})
