import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AccentKey } from '@/config/constants'

/**
 * Appearance preferences.
 *
 * Persisted under `momentum.appearance` — the same key the inline script in
 * `index.html` reads before first paint to avoid a flash of the wrong theme. The
 * shape written here includes `{ theme, accent, density, fontSize }` for that script
 * to keep working.
 */

export type ThemeMode = 'light' | 'dark' | 'system'
export type Density = 'compact' | 'comfortable' | 'spacious'

export const DEFAULT_FONT_SIZE = 16
export const MIN_FONT_SIZE = 12
export const MAX_FONT_SIZE = 24

interface AppearanceState {
  theme: ThemeMode
  accent: AccentKey
  density: Density
  reducedMotion: boolean
  highPerformance: boolean
  fontSize: number
  setTheme: (theme: ThemeMode) => void
  setAccent: (accent: AccentKey) => void
  setDensity: (density: Density) => void
  setReducedMotion: (reducedMotion: boolean) => void
  setHighPerformance: (highPerformance: boolean) => void
  setFontSize: (fontSize: number) => void
}

function prefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

/** Push the current preferences onto <html> where the CSS variables read them. */
export function applyAppearance(
  state: Pick<AppearanceState, 'theme' | 'accent' | 'density' | 'reducedMotion' | 'highPerformance' | 'fontSize'>,
) {
  const root = document.documentElement
  const dark = state.theme === 'dark' || (state.theme === 'system' && prefersDark())
  root.classList.toggle('dark', dark)
  root.dataset.accent = state.accent
  root.dataset.density = state.density
  root.classList.toggle('reduce-motion', Boolean(state.reducedMotion))
  if (state.highPerformance) {
    root.dataset.perf = 'high'
  } else {
    delete root.dataset.perf
  }

  const fontSize = typeof state.fontSize === 'number' && !Number.isNaN(state.fontSize) ? state.fontSize : DEFAULT_FONT_SIZE
  root.style.fontSize = `${fontSize}px`
  root.style.setProperty('--font-scale', `${fontSize / DEFAULT_FONT_SIZE}`)
}

export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      theme: 'system',
      accent: 'indigo',
      density: 'comfortable',
      reducedMotion: false,
      highPerformance: false,
      fontSize: DEFAULT_FONT_SIZE,
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setDensity: (density) => set({ density }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setHighPerformance: (highPerformance) => set({ highPerformance }),
      setFontSize: (size) =>
        set({ fontSize: Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size))) }),
    }),
    {
      name: 'momentum.appearance',
      partialize: (s) => ({
        theme: s.theme,
        accent: s.accent,
        density: s.density,
        reducedMotion: s.reducedMotion,
        highPerformance: s.highPerformance,
        fontSize: s.fontSize,
      }),
    },
  ),
)

/**
 * Keep <html> in sync with the store, and follow the OS when the mode is
 * `system`. Called once from `main.tsx`; returns a teardown for tests.
 */
export function initAppearance(): () => void {
  applyAppearance(useAppearance.getState())

  const unsubscribe = useAppearance.subscribe((state) => applyAppearance(state))

  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  const onSystemChange = () => {
    if (useAppearance.getState().theme === 'system') applyAppearance(useAppearance.getState())
  }
  media?.addEventListener?.('change', onSystemChange)

  return () => {
    unsubscribe()
    media?.removeEventListener?.('change', onSystemChange)
  }
}
