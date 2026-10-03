import { create } from 'zustand'
import { openDatabase } from '@/database/db'
import { workspaceRepo } from '@/storage/workspaceRepo'
import type { ID, Workspace, WorkspaceSettings } from '@/types'
import type { DeepPartial } from '@/storage/workspaceRepo'

/**
 * Workspace session state.
 *
 * Owns the one piece of global state the whole app needs before it can render
 * anything: which workspace is active. Entity data is *not* cached here — pages
 * read it through `useLiveQuery` so Dexie pushes updates straight into the
 * components that care, instead of routing every write through a store.
 */

type Phase = 'loading' | 'ready' | 'error'

interface WorkspaceState {
  phase: Phase
  /** Populated when `phase === 'error'`; safe to render to the user. */
  error: string | null
  workspaces: Workspace[]
  activeId: ID | null
  bootstrap: () => Promise<void>
  refresh: () => Promise<void>
  setActive: (id: ID) => Promise<void>
  createWorkspace: (input?: Partial<Workspace>) => Promise<Workspace>
  updateActive: (patch: Partial<Workspace>) => Promise<void>
  updateSettings: (patch: DeepPartial<WorkspaceSettings>) => Promise<void>
  removeWorkspace: (id: ID) => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  phase: 'loading',
  error: null,
  workspaces: [],
  activeId: null,

  async bootstrap() {
    const opened = await openDatabase()
    if (!opened.ok) {
      set({ phase: 'error', error: opened.message })
      return
    }

    try {
      let workspaces = await workspaceRepo.list()

      // First run: a workspace must exist before any page can render.
      if (workspaces.length === 0) {
        const created = await workspaceRepo.create({ name: 'Personal' })
        workspaces = [created]
      }

      const storedId = await workspaceRepo.getActiveId()
      const activeId = workspaces.some((w) => w.id === storedId)
        ? (storedId as ID)
        : workspaces[0].id
      if (activeId !== storedId) await workspaceRepo.setActiveId(activeId)

      set({ phase: 'ready', error: null, workspaces, activeId })
    } catch (error) {
      set({
        phase: 'error',
        error: (error as Error).message || 'Momentum OS could not start.',
      })
    }
  },

  async refresh() {
    const workspaces = await workspaceRepo.list()
    const { activeId } = get()
    set({
      workspaces,
      activeId: workspaces.some((w) => w.id === activeId) ? activeId : (workspaces[0]?.id ?? null),
    })
  },

  async setActive(id) {
    await workspaceRepo.setActiveId(id)
    set({ activeId: id })
  },

  async createWorkspace(input = {}) {
    const created = await workspaceRepo.create(input)
    await workspaceRepo.setActiveId(created.id)
    set((s) => ({ workspaces: [...s.workspaces, created], activeId: created.id }))
    return created
  },

  async updateActive(patch) {
    const { activeId } = get()
    if (!activeId) return
    const next = await workspaceRepo.update(activeId, patch)
    if (next) set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === next.id ? next : w)) }))
  },

  async updateSettings(patch) {
    const { activeId } = get()
    if (!activeId) return
    const next = await workspaceRepo.updateSettings(activeId, patch)
    if (next) set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === next.id ? next : w)) }))
  },

  async removeWorkspace(id) {
    await workspaceRepo.remove(id)
    let workspaces = await workspaceRepo.list()
    // Never leave the app with zero workspaces — there would be nothing to render.
    if (workspaces.length === 0) {
      workspaces = [await workspaceRepo.create({ name: 'Personal' })]
    }
    const activeId = workspaces[0].id
    await workspaceRepo.setActiveId(activeId)
    set({ workspaces, activeId })
  },
}))

/** The active workspace, or `null` while bootstrapping. */
export function useActiveWorkspace(): Workspace | null {
  return useWorkspaceStore((s) => s.workspaces.find((w) => w.id === s.activeId) ?? null)
}

/**
 * The active workspace, asserted non-null. Valid anywhere inside the app shell,
 * which only renders once bootstrap has produced one.
 */
export function useWorkspace(): Workspace {
  const workspace = useActiveWorkspace()
  if (!workspace) throw new Error('useWorkspace called outside a ready workspace context')
  return workspace
}

export function useWorkspaceId(): ID {
  return useWorkspace().id
}

export function useSettings(): WorkspaceSettings {
  return useWorkspace().settings
}
