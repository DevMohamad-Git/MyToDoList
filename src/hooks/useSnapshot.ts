import { useLiveQuery } from 'dexie-react-hooks'
import { loadSnapshot, type WorkspaceSnapshot } from '@/services/analytics'
import { useWorkspace } from '@/stores/workspace'

/**
 * Reactive workspace snapshot.
 *
 * `loadSnapshot` issues its reads through Dexie, so wrapping it in `useLiveQuery`
 * makes the whole analytics layer re-derive automatically whenever any underlying
 * table changes — no manual invalidation, and pages stay declarative.
 *
 * Returns `undefined` on the first render while the read is in flight.
 */
export function useSnapshot(): WorkspaceSnapshot | undefined {
  const workspace = useWorkspace()
  return useLiveQuery(
    () => loadSnapshot(workspace),
    // `updatedAt` changes when settings change, which every derivation depends on.
    [workspace.id, workspace.updatedAt],
  )
}
