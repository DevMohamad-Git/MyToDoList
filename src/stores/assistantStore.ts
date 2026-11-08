import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_AI_PROVIDERS } from '@/services/ai/providers'
import { callAssistant } from '@/services/ai/aiClient'
import { executeProposal, rollbackGranular } from '@/services/ai/actionExecutor'
import { assistantRepo } from '@/storage/assistantRepo'
import type {
  AIProviderId,
  AIProviderState,
  AssistantConversation,
  AssistantMessage,
  AssistantProposal,
  AssistantSettings,
  SearchSettings,
} from '@/types/assistant'
import type { ID } from '@/types'
import { nowISO } from '@/utils/date'
import { newId } from '@/utils/id'

export interface AssistantStoreState {
  // Persisted settings (localStorage)
  settings: AssistantSettings

  // In-memory conversation state
  conversations: AssistantConversation[]
  activeConversationId: string | null
  isGenerating: boolean
  activeError: string | null

  // Actions - Settings & Providers
  setActiveProvider: (id: AIProviderId) => void
  setProviderKey: (id: AIProviderId, key: string) => void
  setProviderModel: (id: AIProviderId, model: string, isCustom?: boolean) => void
  setProviderCustomBaseUrl: (id: AIProviderId, url: string) => void
  setAvailableModels: (id: AIProviderId, models: string[]) => void
  setProviderStatus: (id: AIProviderId, status: AIProviderState['lastStatus'], error?: string) => void
  setSearchSettings: (patch: Partial<SearchSettings>) => void
  setDirectCreationMode: (enabled: boolean) => void
  setAutoSwitchOnQuota: (enabled: boolean) => void
  setCustomInstructions: (instructions: string) => void

  // Actions - Conversations & Messages
  loadConversations: (workspaceId: ID) => Promise<void>
  createConversation: (workspaceId: ID, title?: string, webSearchDefault?: boolean) => Promise<string>
  selectConversation: (id: string) => void
  deleteConversation: (workspaceId: ID, id: string) => Promise<void>
  clearConversations: (workspaceId: ID) => Promise<void>
  toggleConversationWebSearch: (id: string) => void

  sendMessage: (workspaceId: ID, text: string) => Promise<void>
  submitAnswers: (workspaceId: ID, messageId: string, answers: Record<string, string>) => Promise<void>
  applyProposalAction: (
    workspaceId: ID,
    messageId: string,
    proposalOverride?: AssistantProposal,
  ) => Promise<{ success: boolean; message: string; createdProjectId?: ID }>
  rollbackProposalAction: (workspaceId: ID, messageId: string) => Promise<boolean>
  cancelProposalAction: (workspaceId: ID, messageId: string) => Promise<void>
  stopGenerating: () => void
}

let activeAbortController: AbortController | null = null

export const useAssistantStore = create<AssistantStoreState>()(
  persist(
    (set, get) => ({
      settings: {
        activeProviderId: 'openrouter',
        providers: { ...DEFAULT_AI_PROVIDERS },
        search: {
          provider: 'tavily',
          apiKey: '',
          enabledDefault: false,
        },
        directCreationMode: false,
        autoSwitchOnQuota: true,
        customInstructions: '',
      },

      conversations: [],
      activeConversationId: null,
      isGenerating: false,
      activeError: null,

      /* ------------------------------------------------ settings mutations -- */

      setActiveProvider: (id) => {
        set((state) => ({
          settings: { ...state.settings, activeProviderId: id },
        }))
      },

      setProviderKey: (id, key) => {
        set((state) => {
          const currentProv = state.settings.providers[id] || DEFAULT_AI_PROVIDERS[id]
          return {
            settings: {
              ...state.settings,
              providers: {
                ...state.settings.providers,
                [id]: { ...currentProv, apiKey: key.trim(), lastStatus: 'idle', lastError: undefined },
              },
            },
          }
        })
      },

      setProviderModel: (id, model, isCustom = false) => {
        set((state) => {
          const currentProv = state.settings.providers[id] || DEFAULT_AI_PROVIDERS[id]
          return {
            settings: {
              ...state.settings,
              providers: {
                ...state.settings.providers,
                [id]: { ...currentProv, selectedModel: model.trim(), isCustomModel: isCustom },
              },
            },
          }
        })
      },

      setProviderCustomBaseUrl: (id, url) => {
        set((state) => {
          const currentProv = state.settings.providers[id] || DEFAULT_AI_PROVIDERS[id]
          return {
            settings: {
              ...state.settings,
              providers: {
                ...state.settings.providers,
                [id]: { ...currentProv, customBaseUrl: url.trim() },
              },
            },
          }
        })
      },

      setAvailableModels: (id, models) => {
        set((state) => {
          const currentProv = state.settings.providers[id] || DEFAULT_AI_PROVIDERS[id]
          return {
            settings: {
              ...state.settings,
              providers: {
                ...state.settings.providers,
                [id]: { ...currentProv, availableModels: models },
              },
            },
          }
        })
      },

      setProviderStatus: (id, status, error) => {
        set((state) => {
          const currentProv = state.settings.providers[id] || DEFAULT_AI_PROVIDERS[id]
          return {
            settings: {
              ...state.settings,
              providers: {
                ...state.settings.providers,
                [id]: { ...currentProv, lastStatus: status, lastError: error },
              },
            },
          }
        })
      },

      setSearchSettings: (patch) => {
        set((state) => ({
          settings: {
            ...state.settings,
            search: { ...state.settings.search, ...patch },
          },
        }))
      },

      setDirectCreationMode: (enabled) => {
        set((state) => ({
          settings: { ...state.settings, directCreationMode: enabled },
        }))
      },

      setAutoSwitchOnQuota: (enabled) => {
        set((state) => ({
          settings: { ...state.settings, autoSwitchOnQuota: enabled },
        }))
      },

      setCustomInstructions: (instructions) => {
        set((state) => ({
          settings: { ...state.settings, customInstructions: instructions },
        }))
      },

      /* ------------------------------------------- conversations lifecycle -- */

      loadConversations: async (workspaceId) => {
        const list = await assistantRepo.loadConversations(workspaceId)
        set({
          conversations: list,
          activeConversationId: list[0]?.id ?? null,
        })
      },

      createConversation: async (workspaceId, title, webSearchDefault) => {
        const id = newId()
        const now = nowISO()
        const newConv: AssistantConversation = {
          id,
          workspaceId,
          title: title || 'گفتگوی جدید',
          createdAt: now,
          updatedAt: now,
          webSearchEnabled: webSearchDefault ?? get().settings.search.enabledDefault,
          messages: [],
        }

        await assistantRepo.saveConversation(newConv)

        set((state) => ({
          conversations: [newConv, ...state.conversations],
          activeConversationId: id,
          activeError: null,
        }))

        return id
      },

      selectConversation: (id) => {
        set({ activeConversationId: id, activeError: null })
      },

      deleteConversation: async (workspaceId, id) => {
        await assistantRepo.deleteConversation(workspaceId, id)
        set((state) => {
          const filtered = state.conversations.filter((c) => c.id !== id)
          const nextActive = state.activeConversationId === id ? filtered[0]?.id ?? null : state.activeConversationId
          return {
            conversations: filtered,
            activeConversationId: nextActive,
          }
        })
      },

      clearConversations: async (workspaceId) => {
        await assistantRepo.clearAllConversations(workspaceId)
        set({ conversations: [], activeConversationId: null })
      },

      toggleConversationWebSearch: (id) => {
        const conv = get().conversations.find((c) => c.id === id)
        if (!conv) return
        const updated = { ...conv, webSearchEnabled: !conv.webSearchEnabled }
        void assistantRepo.saveConversation(updated)
        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === id ? updated : c)),
        }))
      },

      /* --------------------------------------------- messaging & execution -- */

      sendMessage: async (workspaceId, text) => {
        if (!text.trim() || get().isGenerating) return

        let convId = get().activeConversationId
        let conv = get().conversations.find((c) => c.id === convId)

        if (!convId || !conv) {
          convId = await get().createConversation(workspaceId, text.slice(0, 30))
          conv = get().conversations.find((c) => c.id === convId)!
        }

        const userMsg: AssistantMessage = {
          id: newId(),
          role: 'user',
          content: text.trim(),
          createdAt: nowISO(),
        }

        const updatedMessages = [...conv.messages, userMsg]
        const updatedConv: AssistantConversation = {
          ...conv,
          title: conv.messages.length === 0 ? text.slice(0, 35) : conv.title,
          updatedAt: nowISO(),
          messages: updatedMessages,
        }

        await assistantRepo.saveConversation(updatedConv)
        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === convId ? updatedConv : c)),
          isGenerating: true,
          activeError: null,
        }))

        activeAbortController = new AbortController()

        try {
          const activeProvId = get().settings.activeProviderId
          let provider = get().settings.providers[activeProvId] || DEFAULT_AI_PROVIDERS[activeProvId]

          let result = await callAssistant({
            workspaceId,
            userPrompt: text.trim(),
            conversationHistory: updatedMessages,
            provider,
            searchSettings: get().settings.search,
            webSearchEnabled: conv.webSearchEnabled,
            customInstructions: get().settings.customInstructions,
            signal: activeAbortController.signal,
          })

          // Handle quota error auto-switch if enabled
          if (result.isQuotaError && get().settings.autoSwitchOnQuota) {
            get().setProviderStatus(activeProvId, 'quota_exhausted', result.error)
            // Look for another provider with an API key
            const otherProvKey = (Object.keys(get().settings.providers) as AIProviderId[]).find(
              (pId) => pId !== activeProvId && Boolean(get().settings.providers[pId]?.apiKey?.trim()),
            )
            if (otherProvKey) {
              get().setActiveProvider(otherProvKey)
              provider = get().settings.providers[otherProvKey]
              result = await callAssistant({
                workspaceId,
                userPrompt: text.trim(),
                conversationHistory: updatedMessages,
                provider,
                searchSettings: get().settings.search,
                webSearchEnabled: conv.webSearchEnabled,
                customInstructions: get().settings.customInstructions,
                signal: activeAbortController.signal,
              })
            }
          }

          // Direct creation mode handling (if enabled and proposal is a simple create action)
          const finalProposal = result.proposal
          let actionStatus: AssistantMessage['actionStatus'] = finalProposal ? 'pending' : undefined
          let undoLog: AssistantMessage['undoLog'] = undefined

          if (
            finalProposal &&
            get().settings.directCreationMode &&
            finalProposal.type === 'create_project_tasks' &&
            (finalProposal.tasks?.length ?? 0) <= 3
          ) {
            try {
              const execRes = await executeProposal(workspaceId, finalProposal)
              actionStatus = 'executed'
              undoLog = execRes.undoLog
              result.message = `${result.message}\n\n✅ ${execRes.message}`
            } catch {
              // fallback to pending card if direct execution failed
              actionStatus = 'pending'
            }
          }

          const assistantMsg: AssistantMessage = {
            id: newId(),
            role: 'assistant',
            content: result.message,
            createdAt: nowISO(),
            questions: result.questions,
            proposal: finalProposal,
            actionStatus,
            undoLog,
            sources: result.sources,
            error: result.error,
          }

          const finalConv: AssistantConversation = {
            ...updatedConv,
            updatedAt: nowISO(),
            messages: [...updatedMessages, assistantMsg],
          }

          await assistantRepo.saveConversation(finalConv)
          set((state) => ({
            conversations: state.conversations.map((c) => (c.id === convId ? finalConv : c)),
            isGenerating: false,
          }))
        } catch (err) {
          const errorMsg = (err as Error).message || 'خطا در برقراری ارتباط با دستیار.'
          set({ isGenerating: false, activeError: errorMsg })
        } finally {
          activeAbortController = null
        }
      },

      submitAnswers: async (workspaceId, messageId, answers) => {
        const convId = get().activeConversationId
        const conv = get().conversations.find((c) => c.id === convId)
        if (!conv) return

        // Format answers into clear text prompt
        const formattedAnswers = Object.entries(answers)
          .map(([qId, ans]) => `پاسخ به ${qId}: ${ans}`)
          .join('\n')

        // Update the target message with selectedAnswers
        const updatedMsgs = conv.messages.map((m) =>
          m.id === messageId ? { ...m, selectedAnswers: answers } : m,
        )
        const updatedConv = { ...conv, messages: updatedMsgs }
        await assistantRepo.saveConversation(updatedConv)

        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === convId ? updatedConv : c)),
        }))

        // Trigger continuation message
        await get().sendMessage(workspaceId, `پاسخ‌های من به سؤالات شما:\n${formattedAnswers}`)
      },

      applyProposalAction: async (workspaceId, messageId, proposalOverride) => {
        const convId = get().activeConversationId
        const conv = get().conversations.find((c) => c.id === convId)
        if (!conv) return { success: false, message: 'گفتگو یافت نشد.' }

        const targetMsg = conv.messages.find((m) => m.id === messageId)
        const proposalToRun = proposalOverride || targetMsg?.proposal
        if (!proposalToRun) return { success: false, message: 'پیشنهادی برای اجرا وجود ندارد.' }

        try {
          const execRes = await executeProposal(workspaceId, proposalToRun)

          const updatedMsgs = conv.messages.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  actionStatus: 'executed' as const,
                  undoLog: execRes.undoLog,
                  proposal: proposalToRun,
                }
              : m,
          )

          const updatedConv = { ...conv, updatedAt: nowISO(), messages: updatedMsgs }
          await assistantRepo.saveConversation(updatedConv)

          set((state) => ({
            conversations: state.conversations.map((c) => (c.id === convId ? updatedConv : c)),
          }))

          return {
            success: true,
            message: execRes.message,
            createdProjectId: execRes.createdProjectId,
          }
        } catch (err) {
          const msg = (err as Error).message || 'خطا در اجرای پیشنهاد.'
          return { success: false, message: msg }
        }
      },

      rollbackProposalAction: async (_workspaceId, messageId) => {
        const convId = get().activeConversationId
        const conv = get().conversations.find((c) => c.id === convId)
        if (!conv) return false

        const targetMsg = conv.messages.find((m) => m.id === messageId)
        if (!targetMsg?.undoLog) return false

        try {
          await rollbackGranular(targetMsg.undoLog)

          const updatedMsgs = conv.messages.map((m) =>
            m.id === messageId ? { ...m, actionStatus: 'undone' as const } : m,
          )

          const updatedConv = { ...conv, updatedAt: nowISO(), messages: updatedMsgs }
          await assistantRepo.saveConversation(updatedConv)

          set((state) => ({
            conversations: state.conversations.map((c) => (c.id === convId ? updatedConv : c)),
          }))

          return true
        } catch {
          return false
        }
      },

      cancelProposalAction: async (_workspaceId, messageId) => {
        const convId = get().activeConversationId
        const conv = get().conversations.find((c) => c.id === convId)
        if (!conv) return

        const updatedMsgs = conv.messages.map((m) =>
          m.id === messageId ? { ...m, actionStatus: 'cancelled' as const } : m,
        )

        const updatedConv = { ...conv, updatedAt: nowISO(), messages: updatedMsgs }
        await assistantRepo.saveConversation(updatedConv)

        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === convId ? updatedConv : c)),
        }))
      },

      stopGenerating: () => {
        if (activeAbortController) {
          activeAbortController.abort()
          activeAbortController = null
        }
        set({ isGenerating: false })
      },
    }),
    {
      name: 'flowos.ai_assistant',
      partialize: (state) => ({ settings: state.settings }),
    },
  ),
)
