import type {
  AIProviderState,
  AssistantMessage,
  AssistantProposal,
  AssistantQuestion,
  SearchSettings,
  WebSearchSource,
} from '@/types/assistant'
import type { ID } from '@/types'
import { getProviderBaseUrl, getProviderHeaders } from './providers'
import { queryWorkspaceData } from './queryData'
import { buildSystemPrompt, validateAndParseResponse } from './promptTemplates'
import { executeWebSearch } from './webSearch'

export interface CallAssistantOptions {
  workspaceId: ID
  userPrompt: string
  conversationHistory: AssistantMessage[]
  provider: AIProviderState
  searchSettings: SearchSettings
  webSearchEnabled: boolean
  customInstructions?: string
  signal?: AbortSignal
}

export interface CallAssistantResult {
  message: string
  questions?: AssistantQuestion[]
  proposal?: AssistantProposal
  sources?: WebSearchSource[]
  error?: string
  isQuotaError?: boolean
}

/**
 * Sends a chat completion request to the active AI provider.
 * Implements:
 * - Direct native Google Gemini REST API support (systemInstruction + generateContent)
 * - Detailed server error parsing for all HTTP codes (400, 401, 402, 429, etc.)
 * - Special handling for OpenRouter 402 Payment Required & Google location restrictions
 * - Real web search execution (Tavily/Exa/Serper/Jina)
 * - Strict schema validation & 1-time automatic retry
 */
export async function callAssistant(options: CallAssistantOptions): Promise<CallAssistantResult> {
  const {
    workspaceId,
    userPrompt,
    conversationHistory,
    provider,
    searchSettings,
    webSearchEnabled,
    customInstructions,
    signal,
  } = options

  if (!provider.apiKey?.trim()) {
    return {
      message: 'کلید API برای این ارائه‌دهنده وارد نشده است. لطفاً در بخش تنظیمات دستیار، کلید معتبر را وارد کنید.',
      error: 'بدون کلید API',
    }
  }

  // 1. Gather workspace data via read-only tool
  const workspaceData = await queryWorkspaceData(workspaceId)

  // 2. Perform web search if enabled and search key is available
  let webSources: WebSearchSource[] = []
  if (webSearchEnabled && searchSettings.apiKey?.trim()) {
    try {
      webSources = await executeWebSearch(userPrompt, searchSettings)
    } catch {
      webSources = []
    }
  }

  const allowedUrls = new Set<string>(webSources.map((s) => s.url))

  // 3. Prepare messages payload
  const systemPrompt = buildSystemPrompt(workspaceData, customInstructions, webSources)

  const recentHistory = conversationHistory.slice(-6)
  const baseUrl = getProviderBaseUrl(provider.id, provider.customBaseUrl).replace(/\/$/, '')
  const modelToUse = provider.selectedModel || provider.availableModels[0] || 'gpt-4o-mini'

  // Helper for fetch call supporting both Native Gemini API and OpenAI-compatible endpoints
  async function makeRequest(overrideUserPrompt?: string, assistantHistorySnippet?: string) {
    // ---------------------------------------------------- Google Gemini Native REST
    if (provider.id === 'gemini') {
      const geminiEndpoint = `${baseUrl}/models/${modelToUse}:generateContent?key=${encodeURIComponent(provider.apiKey)}`

      const geminiContents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = []

      for (const m of recentHistory) {
        if (m.role === 'user') {
          geminiContents.push({ role: 'user', parts: [{ text: m.content }] })
        } else if (m.role === 'assistant') {
          geminiContents.push({ role: 'model', parts: [{ text: m.content }] })
        }
      }

      if (assistantHistorySnippet) {
        geminiContents.push({ role: 'model', parts: [{ text: assistantHistorySnippet }] })
      }

      const promptToSend = overrideUserPrompt || userPrompt
      geminiContents.push({ role: 'user', parts: [{ text: promptToSend }] })

      const response = await fetch(geminiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: geminiContents,
          generationConfig: {
            temperature: 0.3,
          },
        }),
        signal,
      })

      if (!response.ok) {
        let serverErrorMsg = ''
        try {
          const errorData = await response.json()
          serverErrorMsg = errorData?.error?.message || errorData?.message || ''
        } catch {
          serverErrorMsg = await response.text().catch(() => '')
        }

        if (serverErrorMsg.includes('User location is not supported')) {
          throw new Error(
            'محدودیت جغرافیایی گوگل (User location is not supported): دسترسی به این مدل از IP فعلی شما توسط گوگل مسدود است. لطفاً از فیلترشکن استفاده کنید، یا از ارائه‌دهنده Groq یا مدل رایگان گوگل روی OpenRouter (google/gemini-2.0-flash-exp:free) استفاده نمایید.',
          )
        }

        if (response.status === 401 || serverErrorMsg.toLowerCase().includes('api key not valid')) {
          throw new Error(`کلید API وارد شده برای گوگل جیمینای نامعتبر است (خطای ۴۰۱): ${serverErrorMsg}`)
        }

        if (response.status === 429) {
          const err = new Error(`سهمیه گوگل به پایان رسیده است (خطای ۴۲۹): ${serverErrorMsg}`)
          ;(err as unknown as { isQuota: boolean }).isQuota = true
          throw err
        }

        throw new Error(`خطای سرور گوگل جیمینای (${response.status}): ${serverErrorMsg || response.statusText}`)
      }

      const data = await response.json()
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      return content as string
    }

    // ---------------------------------------------------- OpenAI-compatible (OpenRouter, Groq, Mistral, Cerebras, Custom)
    const endpoint = `${baseUrl}/chat/completions`
    const headers = getProviderHeaders(provider.id, provider.apiKey)

    const messagesPayload: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ]

    for (const m of recentHistory) {
      if (m.role === 'user' || m.role === 'assistant') {
        messagesPayload.push({
          role: m.role,
          content: m.content,
        })
      }
    }

    if (assistantHistorySnippet) {
      messagesPayload.push({ role: 'assistant', content: assistantHistorySnippet })
    }

    messagesPayload.push({
      role: 'user',
      content: overrideUserPrompt || userPrompt,
    })

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelToUse,
        messages: messagesPayload,
        temperature: 0.3,
      }),
      signal,
    })

    if (!response.ok) {
      let serverErrorMsg = ''
      try {
        const errorData = await response.json()
        serverErrorMsg = errorData?.error?.message || errorData?.message || ''
      } catch {
        serverErrorMsg = await response.text().catch(() => '')
      }

      if (response.status === 401) {
        throw new Error(`کلید API وارد شده نامعتبر است (خطای ۴۰۱): ${serverErrorMsg}`)
      }

      if (response.status === 402 || serverErrorMsg.toLowerCase().includes('balance') || serverErrorMsg.toLowerCase().includes('credit')) {
        throw new Error(
          `خطای عدم موجودی (کد ۴۰۲ Payment Required): این مدل در OpenRouter پولی است و نیاز به موجودی دلاری دارد.\nلطفاً از بخش بالای چت یا تنظیمات، یکی از مدل‌های رایگان (دارای پسوند :free) را انتخاب کنید:\n• meta-llama/llama-3.3-70b-instruct:free\n• google/gemini-2.0-flash-exp:free\n• qwen/qwen-2.5-72b-instruct:free\n• deepseek/deepseek-r1:free\n\nپیام دقیق سرور: ${serverErrorMsg}`,
        )
      }

      if (response.status === 429) {
        const err = new Error(`سهمیه یا محدودیت نرخ درخواست ارائه‌دهنده به پایان رسیده است (خطای ۴۲۹): ${serverErrorMsg}`)
        ;(err as unknown as { isQuota: boolean }).isQuota = true
        throw err
      }

      if (response.status === 503) {
        throw new Error(`سرورهای ارائه‌دهنده در حال حاضر شلوغ هستند (خطای ۵۰۳): ${serverErrorMsg}`)
      }

      throw new Error(`خطای سرور (${response.status}): ${serverErrorMsg || response.statusText}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    return content as string
  }

  let rawOutput = ''
  try {
    rawOutput = await makeRequest()
  } catch (err) {
    const errorMsg = (err as Error).message || 'خطا در ارتباط با ارائه‌دهنده هوش مصنوعی.'
    const isQuota = Boolean((err as unknown as { isQuota?: boolean })?.isQuota)
    return {
      message: errorMsg,
      error: errorMsg,
      isQuotaError: isQuota,
    }
  }

  // 4. Schema validation
  let { parsed, error } = validateAndParseResponse(rawOutput, allowedUrls)

  // 5. Automatic 1-time retry on schema/parse error (Requirement #7)
  if (error || !parsed) {
    try {
      const retryPrompt =
        'پاسخ قبلی شما ساختار JSON معتبر نداشت. لطفاً دقیقاً در قالب فرمت JSON درخواستی با کلیدهای message و proposal/questions پاسخ دهید.'
      const retryOutput = await makeRequest(retryPrompt, rawOutput)
      const secondTry = validateAndParseResponse(retryOutput, allowedUrls)
      if (secondTry.parsed) {
        parsed = secondTry.parsed
        error = undefined
      }
    } catch {
      // If retry failed, proceed with fallback
    }
  }

  // If still no parsed object, present raw text as a clean message
  if (!parsed) {
    return {
      message: rawOutput.replace(/```json/g, '').replace(/```/g, '').trim() || 'پاسخ دریافت شد.',
      sources: webSources,
    }
  }

  return {
    message: parsed.message,
    questions: parsed.questions,
    proposal: parsed.proposal,
    sources: webSources,
  }
}

/**
 * Fast ping / connection test for a provider.
 */
export async function testProviderConnection(provider: AIProviderState): Promise<{
  ok: boolean
  latencyMs?: number
  error?: string
}> {
  if (!provider.apiKey?.trim()) {
    return { ok: false, error: 'کلید API خالی است.' }
  }

  const start = performance.now()
  const baseUrl = getProviderBaseUrl(provider.id, provider.customBaseUrl).replace(/\/$/, '')
  const modelToUse = provider.selectedModel || provider.availableModels[0] || 'gpt-4o-mini'

  try {
    if (provider.id === 'gemini') {
      const endpoint = `${baseUrl}/models/${modelToUse}:generateContent?key=${encodeURIComponent(provider.apiKey)}`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'ping' }] }],
          generationConfig: { maxOutputTokens: 5 },
        }),
      })

      const latencyMs = Math.round(performance.now() - start)

      if (!res.ok) {
        let errBody = ''
        try {
          const j = await res.json()
          errBody = j?.error?.message || j?.message || ''
        } catch {
          errBody = await res.text().catch(() => '')
        }

        if (errBody.includes('User location is not supported')) {
          return {
            ok: false,
            error:
              'محدودیت موقعیت جغرافیایی گوگل (User location is not supported): گوگل دسترسی مستقیم از این منطقه را مسدود کرده است. از فیلترشکن استفاده کنید، یا از مدل رایگان گوگل روی OpenRouter (google/gemini-2.0-flash-exp:free) یا Groq استفاده نمایید.',
          }
        }
        return { ok: false, error: `پاسخ ناموفق (${res.status}): ${errBody || res.statusText}` }
      }

      return { ok: true, latencyMs }
    }

    // OpenAI-compatible providers
    const endpoint = `${baseUrl}/chat/completions`
    const headers = getProviderHeaders(provider.id, provider.apiKey)

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelToUse,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      }),
    })

    const latencyMs = Math.round(performance.now() - start)

    if (!res.ok) {
      let errBody = ''
      try {
        const j = await res.json()
        errBody = j?.error?.message || j?.message || ''
      } catch {
        errBody = await res.text().catch(() => '')
      }

      if (res.status === 401) {
        return { ok: false, error: `کلید API نامعتبر است (۴۰۱): ${errBody}` }
      }
      if (res.status === 402) {
        return {
          ok: false,
          error:
            `خطای عدم موجودی (۴۰۲): این مدل در OpenRouter پولی است و نیاز به موجودی دارد.\nلطفاً مدلی با پسوند :free (مانند meta-llama/llama-3.3-70b-instruct:free یا google/gemini-2.0-flash-exp:free) انتخاب کنید.`,
        }
      }
      if (res.status === 429) {
        return { ok: false, error: `سهمیه این کلید به پایان رسیده است (۴۲۹). ${errBody}` }
      }
      return { ok: false, error: `پاسخ ناموفق (${res.status}): ${errBody || res.statusText}` }
    }

    return { ok: true, latencyMs }
  } catch (err) {
    const msg = (err as Error).message || 'عدم دسترسی به سرور'
    return { ok: false, error: `خطای اتصال (CORS یا اینترنت): ${msg}` }
  }
}
