/**
 * CafeLogo - Brand logo component based on the bundled Cafe icon.
 *
 * Used across splash, setup, error states, and page headers so the visual
 * language stays consistent with the packaged app/tray assets.
 */

import type { CSSProperties } from 'react'

import brandLogo from '../../../../resources/icon.png'
import sakuraPetal from '../../../../resources/tray/trayTemplate@2x.png'

interface CafeLogoProps {
  /** Size preset or custom pixel value */
  size?: 'sm' | 'md' | 'lg' | number
  /** Optional additional class names */
  className?: string
  /** Enable subtle floating/glow animation */
  animated?: boolean
}

const SIZE_PRESETS = {
  sm: 28,
  md: 48,
  lg: 96,
} as const

function getScaledStyles(size: number): {
  padding: number
  radius: number
  petalSize: number
  shellShadow: string
  logoShadow: string
} {
  return {
    padding: size <= 32 ? 5 : size <= 56 ? 7 : 11,
    radius: Math.max(10, Math.round(size * 0.28)),
    petalSize: Math.max(12, Math.round(size * 0.28)),
    shellShadow: size <= 32
      ? '0 10px 22px hsl(232 34% 6% / 0.24), inset 0 1px 0 hsl(0 0% 100% / 0.08)'
      : size <= 56
        ? '0 14px 28px hsl(232 34% 6% / 0.26), inset 0 1px 0 hsl(0 0% 100% / 0.08)'
        : '0 20px 42px hsl(232 34% 6% / 0.3), inset 0 1px 0 hsl(0 0% 100% / 0.08)',
    logoShadow: size <= 32
      ? 'drop-shadow(0 6px 12px hsl(var(--primary) / 0.12))'
      : size <= 56
        ? 'drop-shadow(0 10px 18px hsl(var(--primary) / 0.14))'
        : 'drop-shadow(0 16px 24px hsl(var(--primary) / 0.18))',
  }
}

export function CafeLogo({ size = 'md', className = '', animated = true }: CafeLogoProps): JSX.Element {
  const pixelSize = typeof size === 'number' ? size : SIZE_PRESETS[size]
  const styles = getScaledStyles(pixelSize)

  return (
    <div
      className={`relative no-select ${className}`.trim()}
      style={{ width: pixelSize, height: pixelSize }}
    >
      <div
        className={`absolute inset-0 z-10 brand-logo-shell ${animated ? 'cafe-glow' : ''}`.trim()}
        style={{ borderRadius: styles.radius, boxShadow: styles.shellShadow }}
      />

      <div
        className="relative z-20 h-full w-full"
        style={{ padding: styles.padding }}
      >
        <img
          src={brandLogo}
          alt="Cafe logo"
          className={`h-full w-full object-contain brand-logo-image ${animated ? 'animate-brand-logo-float' : ''}`.trim()}
          style={{ '--brand-logo-shadow': styles.logoShadow } as CSSProperties}
        />
      </div>

      <img
        src={sakuraPetal}
        alt=""
        aria-hidden="true"
        className={`pointer-events-none absolute z-30 ${animated ? 'animate-brand-petal-float' : ''}`.trim()}
        style={{
          top: Math.round(pixelSize * -0.22),
          right: Math.round(pixelSize * -0.2),
          width: Math.round(styles.petalSize * 0.9),
          height: Math.round(styles.petalSize * 0.9),
          opacity: 0.92,
          filter: 'drop-shadow(0 6px 10px hsl(var(--primary) / 0.14))',
        }}
      />
    </div>
  )
}
