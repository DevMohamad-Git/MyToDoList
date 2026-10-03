/**
 * Local folder integration via the File System Access API.
 *
 * What a browser can and cannot do here, stated plainly because the UI has to
 * be honest about it:
 *  - It cannot write to arbitrary paths. The user must pick a directory, and
 *    that grant is per-directory.
 *  - The handle survives reloads (we persist it in IndexedDB — handles are
 *    structured-cloneable) but the *permission* does not always: Chrome
 *    re-prompts after a restart, so every access re-verifies and can fail.
 *  - Firefox and Safari do not implement `showDirectoryPicker` at all, so the
 *    app degrades to IndexedDB-only attachments plus download-based export.
 *
 * Everything below returns explicit result objects rather than throwing, so
 * callers can render a real error state instead of a stack trace.
 */

import { db } from '@/database/db'
import type { ID, LinkedFolder } from '@/types'
import { nowISO } from '@/utils/date'

export interface FSCapabilities {
  directoryPicker: boolean
  filePicker: boolean
  saveFilePicker: boolean
}

export function fsCapabilities(): FSCapabilities {
  const w = window as unknown as Record<string, unknown>
  return {
    directoryPicker: typeof w.showDirectoryPicker === 'function',
    filePicker: typeof w.showOpenFilePicker === 'function',
    saveFilePicker: typeof w.showSaveFilePicker === 'function',
  }
}

export type FSResult<T> = { ok: true; value: T } | { ok: false; error: string }

type PickerWindow = Window & {
  showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<FileSystemDirectoryHandle>
  showSaveFilePicker?: (opts?: {
    suggestedName?: string
    types?: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<FileSystemFileHandle>
}

type PermissionCapableHandle = FileSystemDirectoryHandle & {
  queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
}

function describe(error: unknown): string {
  const e = error as { name?: string; message?: string }
  if (e?.name === 'AbortError') return 'Cancelled.'
  if (e?.name === 'NotAllowedError') return 'Permission denied by the browser.'
  if (e?.name === 'SecurityError')
    return 'Blocked by the browser. This API requires a secure context (https or localhost) and a user gesture.'
  return e?.message || 'Unknown file system error.'
}

/** Prompt for a workspace folder and remember the handle. */
export async function linkFolder(workspaceId: ID): Promise<FSResult<LinkedFolder>> {
  const w = window as PickerWindow
  if (!w.showDirectoryPicker) {
    return { ok: false, error: 'This browser does not support the File System Access API.' }
  }
  try {
    const handle = await w.showDirectoryPicker({ mode: 'readwrite', id: 'momentum-workspace' })
    const record: LinkedFolder = {
      workspaceId,
      handle,
      name: handle.name,
      linkedAt: nowISO(),
    }
    await db.folders.put(record)
    return { ok: true, value: record }
  } catch (error) {
    return { ok: false, error: describe(error) }
  }
}

export async function getLinkedFolder(workspaceId: ID): Promise<LinkedFolder | undefined> {
  return db.folders.get(workspaceId)
}

export async function unlinkFolder(workspaceId: ID): Promise<void> {
  await db.folders.delete(workspaceId)
}

/**
 * Verify (and if needed re-request) write permission. Chrome drops the grant
 * between sessions, so this must run before every write, not once at link time.
 */
export async function ensureFolderPermission(
  folder: LinkedFolder,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<FSResult<true>> {
  const handle = folder.handle as PermissionCapableHandle
  try {
    const current = await handle.queryPermission?.({ mode })
    if (current === 'granted') return { ok: true, value: true }
    const requested = await handle.requestPermission?.({ mode })
    if (requested === 'granted') return { ok: true, value: true }
    return { ok: false, error: 'Access to the linked folder was not granted.' }
  } catch (error) {
    return { ok: false, error: describe(error) }
  }
}

/** Resolve (creating if asked) a nested subdirectory such as `attachments/<taskId>`. */
async function resolveDirectory(
  root: FileSystemDirectoryHandle,
  segments: string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  let dir = root
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(segment, { create })
  }
  return dir
}

/** Windows-invalid characters and path traversal removed. */
export function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^\.+/, '_').trim()
  return cleaned.slice(0, 180) || 'file'
}

export async function writeFileToFolder(
  folder: LinkedFolder,
  path: string[],
  filename: string,
  data: Blob | string,
): Promise<FSResult<string>> {
  const permission = await ensureFolderPermission(folder)
  if (!permission.ok) return permission
  try {
    const dir = await resolveDirectory(folder.handle, path, true)
    const safe = sanitizeFilename(filename)
    const fileHandle = await dir.getFileHandle(safe, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(data)
    await writable.close()
    return { ok: true, value: [...path, safe].join('/') }
  } catch (error) {
    return { ok: false, error: describe(error) }
  }
}

export async function readFileFromFolder(
  folder: LinkedFolder,
  relativePath: string,
): Promise<FSResult<File>> {
  const permission = await ensureFolderPermission(folder, 'read')
  if (!permission.ok) return permission
  try {
    const segments = relativePath.split('/').filter(Boolean)
    const filename = segments.pop()
    if (!filename) return { ok: false, error: 'Empty path.' }
    const dir = await resolveDirectory(folder.handle, segments, false)
    const handle = await dir.getFileHandle(filename)
    return { ok: true, value: await handle.getFile() }
  } catch (error) {
    const e = error as { name?: string }
    if (e?.name === 'NotFoundError') {
      return { ok: false, error: `\u201c${relativePath}\u201d is no longer in the linked folder.` }
    }
    return { ok: false, error: describe(error) }
  }
}

export async function deleteFileFromFolder(
  folder: LinkedFolder,
  relativePath: string,
): Promise<FSResult<true>> {
  const permission = await ensureFolderPermission(folder)
  if (!permission.ok) return permission
  try {
    const segments = relativePath.split('/').filter(Boolean)
    const filename = segments.pop()
    if (!filename) return { ok: false, error: 'Empty path.' }
    const dir = await resolveDirectory(folder.handle, segments, false)
    await dir.removeEntry(filename)
    return { ok: true, value: true }
  } catch (error) {
    const e = error as { name?: string }
    // Already gone is the desired end state, not an error.
    if (e?.name === 'NotFoundError') return { ok: true, value: true }
    return { ok: false, error: describe(error) }
  }
}

/**
 * Save text through the native save dialog when available, otherwise fall back
 * to an anchor download — which every browser supports.
 */
export async function saveTextFile(
  filename: string,
  contents: string,
  mimeType = 'application/json',
): Promise<FSResult<'picker' | 'download'>> {
  const w = window as PickerWindow
  const blob = new Blob([contents], { type: mimeType })
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Momentum export', accept: { [mimeType]: [`.${filename.split('.').pop()}`] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return { ok: true, value: 'picker' }
    } catch (error) {
      const e = error as { name?: string }
      if (e?.name === 'AbortError') return { ok: false, error: 'Cancelled.' }
      // Fall through to the download path on any other picker failure.
    }
  }
  downloadBlob(blob, filename)
  return { ok: true, value: 'download' }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = sanitizeFilename(filename)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoke on the next macrotask; revoking synchronously can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Read a user-selected file as text via a transient `<input type="file">`. */
export function pickTextFile(accept = '.json,application/json'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    let settled = false
    const finish = (file: File | null) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(file)
    }
    input.addEventListener('change', () => finish(input.files?.[0] ?? null))
    // `cancel` fires in modern browsers; without it the promise would hang.
    input.addEventListener('cancel', () => finish(null))
    document.body.appendChild(input)
    input.click()
  })
}
