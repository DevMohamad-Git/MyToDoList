// @vitest-environment jsdom
import { describe, it, expect, beforeEach, beforeAll } from 'vitest'

const store: Record<string, string> = {}
const mockStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = String(value)
  },
  removeItem: (key: string) => {
    delete store[key]
  },
  clear: () => {
    Object.keys(store).forEach((k) => delete store[k])
  },
  length: 0,
  key: () => null,
}
Object.defineProperty(window, 'localStorage', { value: mockStorage, configurable: true, writable: true })
Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, configurable: true, writable: true })

type AppearanceModule = typeof import('./appearance')
let mod: AppearanceModule

beforeAll(async () => {
  mod = await import('./appearance')
})

describe('appearance store & font size customization', () => {
  beforeEach(() => {
    mod.useAppearance.setState({
      theme: 'system',
      accent: 'indigo',
      density: 'comfortable',
      reducedMotion: false,
      highPerformance: false,
      fontSize: mod.DEFAULT_FONT_SIZE,
    })
    document.documentElement.style.fontSize = ''
  })

  it('initializes with default font size 16', () => {
    expect(mod.useAppearance.getState().fontSize).toBe(mod.DEFAULT_FONT_SIZE)
  })

  it('allows setting font size within bounds', () => {
    mod.useAppearance.getState().setFontSize(18)
    expect(mod.useAppearance.getState().fontSize).toBe(18)

    mod.useAppearance.getState().setFontSize(20)
    expect(mod.useAppearance.getState().fontSize).toBe(20)
  })

  it('clamps font size below minimum (12) and above maximum (24)', () => {
    mod.useAppearance.getState().setFontSize(8)
    expect(mod.useAppearance.getState().fontSize).toBe(mod.MIN_FONT_SIZE)

    mod.useAppearance.getState().setFontSize(32)
    expect(mod.useAppearance.getState().fontSize).toBe(mod.MAX_FONT_SIZE)
  })

  it('applies font size to root <html> element and sets --font-scale', () => {
    mod.applyAppearance({
      theme: 'dark',
      accent: 'indigo',
      density: 'comfortable',
      reducedMotion: false,
      highPerformance: false,
      fontSize: 18,
    })

    expect(document.documentElement.style.fontSize).toBe('18px')
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.125')
  })

  it('falls back to DEFAULT_FONT_SIZE if font size is invalid or undefined', () => {
    mod.applyAppearance({
      theme: 'light',
      accent: 'emerald',
      density: 'compact',
      reducedMotion: false,
      highPerformance: false,
      // @ts-expect-error test undefined case
      fontSize: undefined,
    })

    expect(document.documentElement.style.fontSize).toBe('16px')
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1')
  })
})
