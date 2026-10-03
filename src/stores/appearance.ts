import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AccentKey } from '@/config/constants'

/**
 * Appearance preferences.
 *
 * Persisted under `momentum.appearance` — the same key the inline script in
 * `index.html` reads before first paint to avoid a flash of the wrong theme. The
 * shape written here must stay `{ theme, accent, density }` for that script to
 * keep working.
 */

export type ThemeMode = 'light' | 'dark' | 'system'
export type Density = 'compact' | 'comfortable' | 'spacious'

interface AppearanceState {
  theme: ThemeMode
  accent: AccentKey
  density: Density
  setTheme: (theme: ThemeMode) => void
  setAccent: (accent: AccentKey) => void
  setDensity: (density: Density) => void
}

function prefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

/** Push the current preferences onto <html> where the CSS variables read them. */
export function applyAppearance(state: Pick<AppearanceState, 'theme' | 'accent' | 'density'>) {
  const root = document.documentElement
  const dark = state.theme === 'dark' || (state.theme === 'system' && prefersDark())
  root.classList.toggle('dark', dark)
  root.dataset.accent = state.accent
  root.dataset.density = state.density
}

export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      theme: 'system',
      accent: 'indigo',
      density: 'comfortable',
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setDensity: (density) => set({ density }),
    }),
    {
      name: 'momentum.appearance',
      partialize: (s) => ({ theme: s.theme, accent: s.accent, density: s.density }),
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
