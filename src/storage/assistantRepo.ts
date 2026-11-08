import { db } from '@/database/db'
import type { AssistantConversation } from '@/types/assistant'
import type { ID } from '@/types'

const CONV_PREFIX = 'assistant_conv_'

/**
 * Storage repository for Assistant chat history in IndexedDB (db.meta).
 * Fulfills Requirement #5: Chat history in IndexedDB, auto-prunes after 30 days,
 * and remains completely excluded from workspace export bundles and snapshots.
 */
export const assistantRepo = {
  /**
   * Load all conversations for a workspace and auto-prune conversations older than 30 days.
   */
  async loadConversations(workspaceId: ID): Promise<AssistantConversation[]> {
    const prefix = `${CONV_PREFIX}${workspaceId}_`
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const allMeta = await db.meta.toArray()
    const conversations: AssistantConversation[] = []
    const expiredKeys: string[] = []

    for (const row of allMeta) {
      if (row.key.startsWith(prefix)) {
        const conv = row.value as AssistantConversation
        if (conv && conv.id) {
          if (conv.updatedAt < thirtyDaysAgo) {
            expiredKeys.push(row.key)
          } else {
            conversations.push(conv)
          }
        }
      }
    }

    // Clean up expired conversations
    if (expiredKeys.length > 0) {
      await db.meta.bulkDelete(expiredKeys).catch(() => {})
    }

    return conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  /**
   * Save or update a single conversation in IndexedDB.
   */
  async saveConversation(conv: AssistantConversation): Promise<void> {
    const key = `${CONV_PREFIX}${conv.workspaceId}_${conv.id}`
    await db.meta.put({
      key,
      value: conv,
    })
  },

  /**
   * Delete a specific conversation from IndexedDB.
   */
  async deleteConversation(workspaceId: ID, convId: string): Promise<void> {
    const key = `${CONV_PREFIX}${workspaceId}_${convId}`
    await db.meta.delete(key)
  },

  /**
   * Clear all conversations for a workspace.
   */
  async clearAllConversations(workspaceId: ID): Promise<void> {
    const prefix = `${CONV_PREFIX}${workspaceId}_`
    const allMeta = await db.meta.toArray()
    const keysToDelete = allMeta.filter((r) => r.key.startsWith(prefix)).map((r) => r.key)
    if (keysToDelete.length > 0) {
      await db.meta.bulkDelete(keysToDelete)
    }
  },
}
