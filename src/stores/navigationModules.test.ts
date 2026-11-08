// @vitest-environment jsdom
import { beforeEach, beforeAll, describe, expect, it } from 'vitest'

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

type NavigationModulesModule = typeof import('./navigationModules')
let mod: NavigationModulesModule

beforeAll(async () => {
  mod = await import('./navigationModules')
})

describe('navigationModules store', () => {
  beforeEach(() => {
    mockStorage.clear()
    mod.useNavigationModules.getState().resetToDefault()
  })

  it('initializes with the focused default modules', () => {
    const { enabledModules } = mod.useNavigationModules.getState()
    expect(enabledModules).toEqual(mod.DEFAULT_ENABLED_MODULES)
    expect(enabledModules.dashboard).toBe(true)
    expect(enabledModules.tasks).toBe(true)
    expect(enabledModules.planner).toBe(true)
    expect(enabledModules.projects).toBe(true)
    expect(enabledModules.focus).toBe(true)
    expect(enabledModules.habits).toBe(false)
    expect(enabledModules.analytics).toBe(false)
  })

  it('toggles a module on and off', () => {
    const storeState = mod.useNavigationModules.getState()
    expect(storeState.enabledModules.habits).toBe(false)

    storeState.toggleModule('habits')
    expect(mod.useNavigationModules.getState().enabledModules.habits).toBe(true)

    mod.useNavigationModules.getState().toggleModule('habits')
    expect(mod.useNavigationModules.getState().enabledModules.habits).toBe(false)
  })

  it('applies the full preset and focused preset correctly', () => {
    const storeState = mod.useNavigationModules.getState()
    storeState.applyPreset('full')
    expect(mod.useNavigationModules.getState().enabledModules).toEqual(mod.FULL_MODULES)

    mod.useNavigationModules.getState().applyPreset('focused')
    expect(mod.useNavigationModules.getState().enabledModules).toEqual(mod.DEFAULT_ENABLED_MODULES)
  })

  it('prevents disabling the last remaining active module', () => {
    const storeState = mod.useNavigationModules.getState()
    // Turn off everything except tasks
    storeState.setModuleEnabled('dashboard', false)
    storeState.setModuleEnabled('planner', false)
    storeState.setModuleEnabled('projects', false)
    storeState.setModuleEnabled('focus', false)
    storeState.setModuleEnabled('assistant', false)

    const currentState = mod.useNavigationModules.getState().enabledModules
    expect(currentState.tasks).toBe(true)

    // Attempt to disable tasks (the only one left)
    mod.useNavigationModules.getState().setModuleEnabled('tasks', false)

    // Should still be true!
    expect(mod.useNavigationModules.getState().enabledModules.tasks).toBe(true)
  })
})
