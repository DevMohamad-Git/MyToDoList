// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

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

type AssistantStoreModule = typeof import('./assistantStore')
let mod: AssistantStoreModule

beforeAll(async () => {
  mod = await import('./assistantStore')
})

describe('useAssistantStore', () => {
  const workspaceId = 'test_ws_store'

  beforeEach(() => {
    mockStorage.clear()
    mod.useAssistantStore.setState({
      settings: {
        activeProviderId: 'openrouter',
        providers: { ...mod.useAssistantStore.getState().settings.providers },
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
    })
  })

  it('updates provider API keys and active provider', () => {
    const s = mod.useAssistantStore.getState()

    s.setProviderKey('groq', 'gsk_test_key_123')
    expect(mod.useAssistantStore.getState().settings.providers.groq.apiKey).toBe('gsk_test_key_123')

    s.setActiveProvider('groq')
    expect(mod.useAssistantStore.getState().settings.activeProviderId).toBe('groq')
  })

  it('updates search settings and direct creation mode', () => {
    const s = mod.useAssistantStore.getState()

    s.setSearchSettings({ provider: 'tavily', apiKey: 'tvly_test_123', enabledDefault: true })
    expect(mod.useAssistantStore.getState().settings.search.apiKey).toBe('tvly_test_123')
    expect(mod.useAssistantStore.getState().settings.search.enabledDefault).toBe(true)

    s.setDirectCreationMode(true)
    expect(mod.useAssistantStore.getState().settings.directCreationMode).toBe(true)
  })

  it('creates and manages conversations', async () => {
    const s = mod.useAssistantStore.getState()

    const convId = await s.createConversation(workspaceId, 'گفتگوی تست')
    expect(convId).toBeDefined()

    const state = mod.useAssistantStore.getState()
    expect(state.conversations.length).toBe(1)
    expect(state.activeConversationId).toBe(convId)
    expect(state.conversations[0].title).toBe('گفتگوی تست')
    expect(state.conversations[0].webSearchEnabled).toBe(false)

    // Toggle web search on conversation
    s.toggleConversationWebSearch(convId)
    expect(mod.useAssistantStore.getState().conversations[0].webSearchEnabled).toBe(true)

    // Delete conversation
    await s.deleteConversation(workspaceId, convId)
    expect(mod.useAssistantStore.getState().conversations.length).toBe(0)
  })
})
