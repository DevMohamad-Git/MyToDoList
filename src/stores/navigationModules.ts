import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type NavModuleKey =
  | 'dashboard'
  | 'tasks'
  | 'planner'
  | 'projects'
  | 'focus'
  | 'habits'
  | 'goals'
  | 'analytics'
  | 'reviews'
  | 'achievements'
  | 'assistant'

export interface NavigationModulesState {
  enabledModules: Record<NavModuleKey, boolean>
  setModuleEnabled: (key: NavModuleKey, enabled: boolean) => void
  toggleModule: (key: NavModuleKey) => void
  applyPreset: (preset: 'focused' | 'full') => void
  resetToDefault: () => void
}

export const DEFAULT_ENABLED_MODULES: Record<NavModuleKey, boolean> = {
  dashboard: true,
  tasks: true,
  planner: true,
  projects: true,
  focus: true,
  assistant: true,
  habits: false,
  goals: false,
  analytics: false,
  reviews: false,
  achievements: false,
}

export const FULL_MODULES: Record<NavModuleKey, boolean> = {
  dashboard: true,
  tasks: true,
  planner: true,
  projects: true,
  focus: true,
  assistant: true,
  habits: true,
  goals: true,
  analytics: true,
  reviews: true,
  achievements: true,
}

export const useNavigationModules = create<NavigationModulesState>()(
  persist(
    (set, get) => ({
      enabledModules: { ...DEFAULT_ENABLED_MODULES },

      setModuleEnabled: (key: NavModuleKey, enabled: boolean) => {
        const current = get().enabledModules
        // Guard: prevent disabling all pages (at least one must stay enabled)
        if (!enabled) {
          const enabledCount = Object.values(current).filter(Boolean).length
          if (enabledCount <= 1 && current[key]) {
            return
          }
        }
        set({
          enabledModules: {
            ...current,
            [key]: enabled,
          },
        })
      },

      toggleModule: (key: NavModuleKey) => {
        const current = get().enabledModules
        const nextValue = !current[key]
        get().setModuleEnabled(key, nextValue)
      },

      applyPreset: (preset: 'focused' | 'full') => {
        if (preset === 'focused') {
          set({ enabledModules: { ...DEFAULT_ENABLED_MODULES } })
        } else if (preset === 'full') {
          set({ enabledModules: { ...FULL_MODULES } })
        }
      },

      resetToDefault: () => {
        set({ enabledModules: { ...DEFAULT_ENABLED_MODULES } })
      },
    }),
    {
      name: 'flowos.navigation_modules',
      partialize: (state) => ({ enabledModules: state.enabledModules }),
    },
  ),
)
