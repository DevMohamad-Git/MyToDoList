import { db } from '@/database/db'
import { MAX_INLINE_ATTACHMENT_BYTES } from '@/config/constants'
import { logActivity } from '@/storage/activityRepo'
import {
  deleteFileFromFolder,
  getLinkedFolder,
  readFileFromFolder,
  writeFileToFolder,
} from '@/storage/fileSystem'
import type { Attachment, ID } from '@/types'
import { nowISO } from '@/utils/date'
import { newId } from '@/utils/id'

/**
 * Attachment storage with two real backends:
 *
 *  - `indexeddb` (always available): the `Blob` is stored in the `blobs` table.
 *    Browsers store blobs out-of-line, so this handles video and PDFs fine —
 *    unlike localStorage, which we never use for binary data.
 *  - `filesystem` (when the user linked a folder): the bytes are written into
 *    `<folder>/attachments/<taskId>/<filename>` and only metadata lives in
 *    IndexedDB. This is what makes the files usable outside the browser.
 *
 * The backend is chosen per upload, recorded on the row, and honoured on read,
 * so a workspace can contain a mix (e.g. files added before a folder was linked).
 */

export type AttachResult =
  | { ok: true; attachment: Attachment }
  | { ok: false; error: string }

export const attachmentRepo = {
  forTask(taskId: ID) {
    return db.attachments.where('taskId').equals(taskId).toArray()
  },

  forProject(projectId: ID) {
    return db.attachments.where('projectId').equals(projectId).toArray()
  },

  forWorkspace(workspaceId: ID) {
    return db.attachments.where('workspaceId').equals(workspaceId).toArray()
  },

  get(id: ID) {
    return db.attachments.get(id)
  },

  /** Store a file against a task (or project). Prefers the linked folder. */
  async add(
    workspaceId: ID,
    target: { taskId?: ID | null; projectId?: ID | null },
    file: File,
  ): Promise<AttachResult> {
    if (file.size > MAX_INLINE_ATTACHMENT_BYTES) {
      return {
        ok: false,
        error: `“${file.name}” is ${Math.round(file.size / 1024 / 1024)} MB. The limit is ${
          MAX_INLINE_ATTACHMENT_BYTES / 1024 / 1024
        } MB per file.`,
      }
    }

    const id = newId()
    const base: Omit<Attachment, 'storage' | 'blobKey' | 'filePath'> = {
      id,
      workspaceId,
      taskId: target.taskId ?? null,
      projectId: target.projectId ?? null,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      createdAt: nowISO(),
    }

    const folder = await getLinkedFolder(workspaceId)
    if (folder) {
      const scope = target.taskId ?? target.projectId ?? 'workspace'
      const written = await writeFileToFolder(folder, ['attachments', scope], file.name, file)
      if (written.ok) {
        const attachment: Attachment = {
          ...base,
          storage: 'filesystem',
          blobKey: null,
          filePath: written.value,
        }
        await db.attachments.add(attachment)
        await attachmentRepo.logAdded(attachment)
        return { ok: true, attachment }
      }
      // Folder write failed (permission revoked, disk error). Fall back to
      // IndexedDB rather than losing the user's file.
    }

    try {
      const blobKey = `blob-${id}`
      await db.blobs.add({ key: blobKey, workspaceId, blob: file })
      const attachment: Attachment = {
        ...base,
        storage: 'indexeddb',
        blobKey,
        filePath: null,
      }
      await db.attachments.add(attachment)
      await attachmentRepo.logAdded(attachment)
      return { ok: true, attachment }
    } catch (error) {
      const e = error as { name?: string; message?: string }
      if (e?.name === 'QuotaExceededError') {
        return {
          ok: false,
          error: 'Local storage quota exceeded. Remove some attachments or link a workspace folder.',
        }
      }
      return { ok: false, error: e?.message || 'Could not store the file.' }
    }
  },

  async addMany(
    workspaceId: ID,
    target: { taskId?: ID | null; projectId?: ID | null },
    files: File[],
  ): Promise<{ added: Attachment[]; errors: string[] }> {
    const added: Attachment[] = []
    const errors: string[] = []
    for (const file of files) {
      const result = await attachmentRepo.add(workspaceId, target, file)
      if (result.ok) added.push(result.attachment)
      else errors.push(result.error)
    }
    return { added, errors }
  },

  async logAdded(attachment: Attachment) {
    await logActivity(
      attachment.workspaceId,
      'attachment_added',
      attachment.taskId ? 'task' : 'project',
      attachment.taskId ?? attachment.projectId ?? attachment.id,
      `Attached “${attachment.filename}”`,
      { size: attachment.size, storage: attachment.storage },
    )
  },

  /** Resolve the actual bytes, whichever backend holds them. */
  async resolveBlob(attachment: Attachment): Promise<{ ok: true; blob: Blob } | { ok: false; error: string }> {
    if (attachment.storage === 'indexeddb') {
      if (!attachment.blobKey) return { ok: false, error: 'Attachment record has no blob reference.' }
      const record = await db.blobs.get(attachment.blobKey)
      if (!record) return { ok: false, error: 'The stored file is missing from local storage.' }
      return { ok: true, blob: record.blob }
    }
    const folder = await getLinkedFolder(attachment.workspaceId)
    if (!folder) {
      return {
        ok: false,
        error: 'This file lives in a linked folder that is not currently connected. Re-link it in Workspace.',
      }
    }
    if (!attachment.filePath) return { ok: false, error: 'Attachment record has no file path.' }
    const read = await readFileFromFolder(folder, attachment.filePath)
    if (!read.ok) return { ok: false, error: read.error }
    return { ok: true, blob: read.value }
  },

  /** Object URL for previews. Callers must revoke it on unmount. */
  async previewUrl(attachment: Attachment): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
    const resolved = await attachmentRepo.resolveBlob(attachment)
    if (!resolved.ok) return resolved
    // Re-tag the blob with the recorded mime type: files read back from disk can
    // arrive as application/octet-stream, which breaks <img>/<video> previews.
    const typed =
      resolved.blob.type === attachment.mimeType
        ? resolved.blob
        : new Blob([resolved.blob], { type: attachment.mimeType })
    return { ok: true, url: URL.createObjectURL(typed) }
  },

  async remove(id: ID): Promise<{ ok: true } | { ok: false; error: string }> {
    const attachment = await db.attachments.get(id)
    if (!attachment) return { ok: true }

    if (attachment.storage === 'indexeddb' && attachment.blobKey) {
      await db.blobs.delete(attachment.blobKey)
    } else if (attachment.storage === 'filesystem' && attachment.filePath) {
      const folder = await getLinkedFolder(attachment.workspaceId)
      if (folder) {
        const deleted = await deleteFileFromFolder(folder, attachment.filePath)
        if (!deleted.ok) {
          // Remove the record anyway so the UI is not stuck, but say what happened.
          await db.attachments.delete(id)
          return {
            ok: false,
            error: `Removed the reference, but the file on disk could not be deleted: ${deleted.error}`,
          }
        }
      }
    }
    await db.attachments.delete(id)
    await logActivity(
      attachment.workspaceId,
      'attachment_removed',
      attachment.taskId ? 'task' : 'project',
      attachment.taskId ?? attachment.projectId ?? attachment.id,
      `Removed “${attachment.filename}”`,
    )
    return { ok: true }
  },

  /** Cascade helper used by task deletion. Returns how many were removed. */
  async removeForTask(taskId: ID): Promise<number> {
    const rows = await db.attachments.where('taskId').equals(taskId).toArray()
    for (const row of rows) {
      if (row.storage === 'indexeddb' && row.blobKey) await db.blobs.delete(row.blobKey)
      else if (row.storage === 'filesystem' && row.filePath) {
        const folder = await getLinkedFolder(row.workspaceId)
        if (folder) await deleteFileFromFolder(folder, row.filePath)
      }
    }
    await db.attachments.bulkDelete(rows.map((r) => r.id))
    return rows.length
  },

  async removeForProject(projectId: ID): Promise<number> {
    const rows = await db.attachments.where('projectId').equals(projectId).toArray()
    for (const row of rows) {
      if (row.storage === 'indexeddb' && row.blobKey) await db.blobs.delete(row.blobKey)
    }
    await db.attachments.bulkDelete(rows.map((r) => r.id))
    return rows.length
  },

  async totalSize(workspaceId: ID): Promise<number> {
    const rows = await db.attachments.where('workspaceId').equals(workspaceId).toArray()
    return rows.reduce((acc, r) => acc + r.size, 0)
  },
}

/** Coarse category used to pick a preview renderer and an icon. */
export type AttachmentKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'archive' | 'document' | 'other'

export function attachmentKind(attachment: Pick<Attachment, 'mimeType' | 'filename'>): AttachmentKind {
  const mime = attachment.mimeType.toLowerCase()
  const ext = attachment.filename.split('.').pop()?.toLowerCase() ?? ''
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (mime.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'log', 'ts', 'tsx', 'js'].includes(ext))
    return 'text'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mime.includes('zip')) return 'archive'
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'pages'].includes(ext)) return 'document'
  return 'other'
}
