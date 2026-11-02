import { useId } from 'react'
import { coinLabel, metalOf, type Metal } from '../money'

interface Shade {
  light: string
  dark: string
  rim: string
  ink: string
}

/** The metal's tokens in styles.css. Applied through `style`, since an SVG attribute cannot take var(). */
function tokensFor(metal: Metal): Shade {
  const token = (part: string) => `var(--vend-${metal}-${part})`
  return { light: token('light'), dark: token('dark'), rim: token('rim'), ink: token('ink') }
}

const SHADES: Record<Metal, Shade> = {
  copper: tokensFor('copper'),
  silver: tokensFor('silver'),
  gold: tokensFor('gold'),
}

// Shapes are drawn in a 100 x 100 box, `width` across, centred on (50, 50).
const point = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`

function circle(width: number): string {
  const r = width / 2
  return `M ${point(50, 50 - r)} A ${r} ${r} 0 1 1 ${point(50, 50 + r)} A ${r} ${r} 0 1 1 ${point(50, 50 - r)} Z`
}

/** A regular polygon with a flat top, `width` across the flats, like the 12-sided £1. */
function polygon(sides: number, width: number): string {
  const r = width / 2 / Math.cos(Math.PI / sides)
  const corners = Array.from({ length: sides }, (_, k) => {
    const a = Math.PI / sides + (2 * Math.PI * k) / sides
    return point(50 + r * Math.sin(a), 50 - r * Math.cos(a))
  })
  return `M ${corners.join(' L ')} Z`
}

/**
 * A Reuleaux polygon, the curved-sided shape of the 20p and 50p. Each side is an arc centred on
 * the opposite corner, so the coin is the same width whichever way it is measured.
 */
function reuleaux(sides: number, width: number): string {
  const r = width / (2 * Math.sin((Math.PI * (sides - 1)) / (2 * sides)))
  const cy = 50 - width / 2 + r
  const corners = Array.from({ length: sides }, (_, k) => {
    const a = (2 * Math.PI * k) / sides
    return point(50 + r * Math.sin(a), cy - r * Math.cos(a))
  })
  const arcs = corners.map((_, k) => `A ${width} ${width} 0 0 1 ${corners[(k + 1) % sides]}`)
  return `M ${corners[0]} ${arcs.join(' ')} Z`
}

function outline(pence: number, width: number): string {
  if (pence === 20 || pence === 50) return reuleaux(7, width)
  if (pence === 100) return polygon(12, width)
  return circle(width)
}

interface Props {
  denomination: number
  /** Diameter in pixels. */
  size: number
  className?: string
  /** Hide from assistive technology when a parent already names the coin. */
  decorative?: boolean
}

export function Coin({ denomination, size, className, decorative = false }: Props) {
  // useId can contain characters that are not valid in a url(#...) reference.
  const id = `coin${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const outer = SHADES[metalOf(denomination)]
  // £1 and £2 are bimetallic: a gold-coloured ring round a silver-coloured centre.
  const inner = denomination >= 100 ? SHADES.silver : null
  const label = coinLabel(denomination)
  const fontSize = label.length > 2 ? 29 : inner ? 30 : 34

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
    >
      <defs>
        <Sheen id={`${id}o`} shade={outer} />
        {inner && <Sheen id={`${id}i`} shade={inner} />}
      </defs>
      <path d={outline(denomination, 96)} fill={`url(#${id}o)`} style={{ stroke: outer.rim }} strokeWidth={2} />
      <path
        d={outline(denomination, 85)}
        fill="none"
        style={{ stroke: outer.rim }}
        strokeOpacity={0.3}
        strokeWidth={1.5}
      />
      {inner && (
        <path
          d={circle(denomination === 200 ? 68 : 62)}
          fill={`url(#${id}i)`}
          style={{ stroke: inner.rim }}
          strokeWidth={1.5}
        />
      )}
      {/* No font-family: the text inherits the page's font, like every other figure. */}
      <text
        x="50"
        y="51"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight={700}
        style={{ fill: (inner ?? outer).ink }}
      >
        {label}
      </text>
    </svg>
  )
}

function Sheen({ id, shade }: { id: string; shade: Shade }) {
  return (
    <radialGradient id={id} cx="34%" cy="28%" r="80%">
      <stop offset="0%" style={{ stopColor: shade.light }} />
      <stop offset="100%" style={{ stopColor: shade.dark }} />
    </radialGradient>
  )
}
