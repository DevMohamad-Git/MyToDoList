import type { AIProviderId, AIProviderState } from '@/types/assistant'

export const DEFAULT_AI_PROVIDERS: Record<AIProviderId, AIProviderState> = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    apiKey: '',
    selectedModel: 'meta-llama/llama-3.3-70b-instruct:free',
    availableModels: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemini-2.0-flash-exp:free',
      'google/gemini-2.0-pro-exp-02-05:free',
      'qwen/qwen-2.5-72b-instruct:free',
      'deepseek/deepseek-r1:free',
      'deepseek/deepseek-chat:free',
      'mistralai/mistral-7b-instruct:free',
      'meta-llama/llama-3.1-8b-instruct:free',
    ],
    keyUrl: 'https://openrouter.ai/keys',
    freeTierNotes: '۲۰ درخواست در دقیقه، ۵۰ در روز؛ مدل‌های دارای پسوند :free کاملاً رایگان هستند؛ بدون نیاز به کارت بانکی.',
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    apiKey: '',
    selectedModel: 'llama-3.3-70b-versatile',
    availableModels: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
    ],
    keyUrl: 'https://console.groq.com/keys',
    freeTierNotes: '۳۰ درخواست در دقیقه، ۱٬۰۰۰ درخواست در روز؛ سرعت فوق‌العاده بالا؛ بدون نیاز به کارت بانکی.',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini (Google AI Studio)',
    apiKey: '',
    selectedModel: 'gemini-2.0-flash',
    availableModels: [
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash-8b',
    ],
    keyUrl: 'https://aistudio.google.com/app/apikey',
    freeTierNotes: '۵ تا ۱۰ درخواست در دقیقه، بسته به مدل؛ مستقیم از Google AI Studio؛ بدون نیاز به کارت بانکی.',
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral',
    apiKey: '',
    selectedModel: 'mistral-small-latest',
    availableModels: [
      'mistral-small-latest',
      'mistral-large-latest',
      'open-mistral-nemo',
    ],
    keyUrl: 'https://console.mistral.ai/api-keys/',
    freeTierNotes: 'حدود ۱ میلیارد توکن در ماه؛ شرط: پذیرفتن استفاده از داده برای آموزش مدل.',
  },
  cerebras: {
    id: 'cerebras',
    name: 'Cerebras',
    apiKey: '',
    selectedModel: 'llama3.1-70b',
    availableModels: [
      'llama3.1-70b',
      'llama3.1-8b',
    ],
    keyUrl: 'https://cloud.cerebras.ai/',
    freeTierNotes: '۳۰ درخواست در دقیقه، حدود ۱ میلیون توکن در روز؛ سرعت فوق‌العاده.',
  },
  custom: {
    id: 'custom',
    name: 'ارائه‌دهنده‌ی دلخواه (سازگار با OpenAI)',
    apiKey: '',
    selectedModel: 'gpt-4o-mini',
    availableModels: [
      'gpt-4o-mini',
      'gpt-4o',
      'claude-3-5-sonnet',
    ],
    customBaseUrl: 'http://localhost:11434/v1',
    keyUrl: '',
    freeTierNotes: 'آدرس Base URL و کلید API را مطابق سرویس سازگار خود وارد کنید.',
  },
}

export function getProviderBaseUrl(providerId: AIProviderId, customBaseUrl?: string): string {
  const isDev = typeof window !== 'undefined' && import.meta.env.DEV

  if (isDev) {
    switch (providerId) {
      case 'openrouter':
        return '/api-proxy/openrouter'
      case 'groq':
        return '/api-proxy/groq'
      case 'gemini':
        return '/api-proxy/gemini/v1beta'
      case 'mistral':
        return '/api-proxy/mistral/v1'
      case 'cerebras':
        return '/api-proxy/cerebras/v1'
      case 'custom':
        return customBaseUrl?.trim() || 'http://localhost:11434/v1'
    }
  }

  switch (providerId) {
    case 'openrouter':
      return 'https://openrouter.ai/api/v1'
    case 'groq':
      return 'https://api.groq.com/openai/v1'
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1beta'
    case 'mistral':
      return 'https://api.mistral.ai/v1'
    case 'cerebras':
      return 'https://api.cerebras.ai/v1'
    case 'custom':
      return customBaseUrl?.trim() || 'http://localhost:11434/v1'
  }
}

export function getProviderHeaders(providerId: AIProviderId, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  if (providerId === 'openrouter') {
    headers['HTTP-Referer'] = 'https://flowos.local'
    headers['X-Title'] = 'FlowOS Assistant'
  }

  return headers
}

/**
 * Dynamically fetch available models from the provider endpoint.
 */
export async function fetchProviderModels(provider: AIProviderState): Promise<string[]> {
  const baseUrl = getProviderBaseUrl(provider.id, provider.customBaseUrl).replace(/\/$/, '')
  const headers = getProviderHeaders(provider.id, provider.apiKey)

  let endpoint = `${baseUrl}/models`
  if (provider.id === 'gemini') {
    endpoint = `${baseUrl}/models?key=${encodeURIComponent(provider.apiKey)}`
  }

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: provider.id === 'gemini' ? { 'Content-Type': 'application/json' } : headers,
    })

    if (!res.ok) {
      let errBody = ''
      try {
        const j = await res.json()
        errBody = j?.error?.message || j?.message || ''
      } catch {
        errBody = await res.text().catch(() => '')
      }

      if (res.status === 401) {
        throw new Error(`کلید API نامعتبر است (کد خطا: ۴۰۱). ${errBody}`)
      }
      if (res.status === 402) {
        throw new Error(`خطای عدم موجودی حساب (کد خطا: ۴۰۲). ${errBody}`)
      }
      if (res.status === 429) {
        throw new Error(`محدودیت نرخ درخواست یا سهمیه ارائه‌دهنده تمام شده است (کد خطا: ۴۲۹). ${errBody}`)
      }
      if (errBody.includes('User location is not supported')) {
        throw new Error('محدودیت موقعیت جغرافیایی گوگل (User location is not supported): دسترسی مستقیم به Gemini از این موقعیت جغرافیایی توسط گوگل مسدود است. لطفاً از فیلترشکن استفاده کنید، یا از مدل رایگان گوگل روی OpenRouter (google/gemini-2.0-flash-exp:free) یا ارائه‌دهنده Groq استفاده کنید.')
      }
      throw new Error(`خطای دریافت مدل‌ها (${res.status}): ${errBody || res.statusText}`)
    }

    const data = await res.json()

    // 1. Handle Google Gemini native models response: { models: [{ name: "models/gemini-2.0-flash", ... }] }
    if (provider.id === 'gemini' && Array.isArray(data.models)) {
      const geminiModels = data.models
        .filter((m: { name?: string; supportedGenerationMethods?: string[] }) =>
          Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'),
        )
        .map((m: { name: string }) => m.name.replace(/^models\//, ''))
        .sort((a: string, b: string) => a.localeCompare(b))

      return geminiModels.length > 0 ? geminiModels : provider.availableModels
    }

    // 2. Handle OpenAI-compatible response: { data: [{ id: "..." }] }
    if (Array.isArray(data.data)) {
      const allModelIds: string[] = data.data
        .map((m: { id?: string }) => m.id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)

      // On OpenRouter, put all completely free models (:free) at the very top
      if (provider.id === 'openrouter') {
        const freeModels = allModelIds.filter((id) => id.endsWith(':free')).sort((a, b) => a.localeCompare(b))
        const paidModels = allModelIds.filter((id) => !id.endsWith(':free')).sort((a, b) => a.localeCompare(b))
        return [...freeModels, ...paidModels]
      }

      return allModelIds.sort((a, b) => a.localeCompare(b))
    }

    return provider.availableModels
  } catch (err) {
    const msg = (err as Error).message || 'خطا در ارتباط با سرور'
    throw new Error(`دریافت فهرست مدل‌ها ناموفق بود: ${msg}`)
  }
}
