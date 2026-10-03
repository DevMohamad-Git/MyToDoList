import { useCallback } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Priority, ProjectStatus, TaskStatus } from '@/types'
import type { Rating } from '@/services/scoring'
import { en, type Dictionary, type TranslationKey } from './en'
import { fa } from './fa'

export type { TranslationKey } from './en'

/**
 * Tiny i18n layer — no dependency, no context provider.
 *
 * The active language lives in a zustand store persisted under
 * `momentum.language` (a separate key from `momentum.appearance`, whose blob
 * shape the inline pre-paint script in `index.html` owns). Components read it
 * through `useT()`; non-React modules (date formatting, recommendation text)
 * call the plain `t()` and re-render whenever an ancestor subscribes.
 *
 * Persian switches `<html>` to `dir="rtl"`; layouts use logical CSS utilities
 * (`start/end`, `ms/me`) so both directions share one component tree.
 */

export type Language = 'en' | 'fa'

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'fa', label: 'فارسی' },
]

const DICTIONARIES: Record<Language, Dictionary> = { en, fa }

interface I18nState {
  language: Language
  setLanguage: (language: Language) => void
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      // Persian is the default UI language (RTL); switchable in Settings.
      language: 'fa',
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'momentum.language',
      partialize: (s) => ({ language: s.language }),
    },
  ),
)

/** Push the active language onto `<html>`: `lang` attribute and text direction. */
export function applyLanguage(language: Language) {
  const root = document.documentElement
  root.lang = language
  root.dir = language === 'fa' ? 'rtl' : 'ltr'
}

/**
 * Apply the persisted language before React mounts and keep `<html>` in sync.
 * Called once from `main.tsx`; returns a teardown for tests.
 */
export function initI18n(): () => void {
  applyLanguage(useI18n.getState().language)
  return useI18n.subscribe((state) => applyLanguage(state.language))
}

export type Vars = Record<string, string | number>

/** BCP 47 tag for `Intl` APIs — `fa-IR` also switches dates to the Jalali calendar. */
export function intlLocale(language: Language = useI18n.getState().language): string | undefined {
  return language === 'fa' ? 'fa-IR' : undefined
}

/** Fill `{placeholder}` slots in a translated string. */
function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text
  let out = text
  for (const [key, value] of Object.entries(vars)) {
    // Isolate each substitution so English titles/numbers don't scramble RTL text.
    out = out.replaceAll(`{${key}}`, `\u2068${String(value)}\u2069`)
  }
  return out
}

export function translate(language: Language, key: TranslationKey, vars?: Vars): string {
  return interpolate(DICTIONARIES[language][key] ?? en[key], vars)
}

/** Plain (non-hook) translation using the active language. Safe outside React. */
export function t(key: TranslationKey, vars?: Vars): string {
  return translate(useI18n.getState().language, key, vars)
}

/** Subscribe a component to the active language and get a bound `t`. */
export function useT() {
  const language = useI18n((s) => s.language)
  return useCallback(
    (key: TranslationKey, vars?: Vars) => translate(language, key, vars),
    [language],
  )
}

/* ------------------------------------------------------- enum label maps -- */
/* Closed vocabularies rendered by shared UI primitives; kept here so every   */
/* surface flips language at once.                                            */

export function taskStatusLabel(status: TaskStatus): string {
  const map: Record<TaskStatus, TranslationKey> = {
    inbox: 'stInbox',
    planned: 'stPlanned',
    in_progress: 'stInProgress',
    blocked: 'stBlocked',
    completed: 'stCompleted',
    cancelled: 'stCancelled',
  }
  return t(map[status])
}

export function projectStatusLabel(status: ProjectStatus): string {
  const map: Record<ProjectStatus, TranslationKey> = {
    planning: 'stPlanning',
    active: 'stActive',
    on_hold: 'stOnHold',
    completed: 'stCompleted',
    archived: 'stArchived',
  }
  return t(map[status])
}

export function priorityLabel(priority: Priority): string {
  const map: Record<Priority, TranslationKey> = {
    critical: 'prCritical',
    high: 'prHigh',
    medium: 'prMedium',
    low: 'prLow',
  }
  return t(map[priority])
}

export function ratingLabel(rating: Rating): string {
  const map: Record<Rating, TranslationKey> = {
    Excellent: 'rExcellent',
    'Very Good': 'rVeryGood',
    Good: 'rGood',
    Fair: 'rFair',
    'Needs Improvement': 'rNeedsImprovement',
    'No Data': 'rNoData',
  }
  return t(map[rating])
}
