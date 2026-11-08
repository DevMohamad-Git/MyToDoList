import type { SearchSettings, WebSearchSource } from '@/types/assistant'

export async function executeWebSearch(
  query: string,
  settings: SearchSettings,
): Promise<WebSearchSource[]> {
  if (!settings.apiKey?.trim()) {
    return []
  }

  const isDev = typeof window !== 'undefined' && import.meta.env.DEV
  const trimmedKey = settings.apiKey.trim()

  switch (settings.provider) {
    case 'tavily': {
      const endpoint = isDev ? '/api-proxy/tavily/search' : 'https://api.tavily.com/search'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: trimmedKey,
          query,
          search_depth: 'basic',
          max_results: 5,
        }),
      })

      if (!res.ok) {
        throw new Error(`خطای سرویس Tavily (${res.status}): ${res.statusText}`)
      }

      const data = await res.json()
      if (Array.isArray(data.results)) {
        return data.results.map((r: { title?: string; url?: string; content?: string }) => ({
          title: r.title || 'منبع وب',
          url: r.url || '',
          snippet: r.content || '',
        })).filter((s: WebSearchSource) => Boolean(s.url && s.url.startsWith('http')))
      }
      return []
    }

    case 'serper': {
      const endpoint = isDev ? '/api-proxy/serper/search' : 'https://google.serper.dev/search'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': trimmedKey,
        },
        body: JSON.stringify({
          q: query,
          num: 5,
        }),
      })

      if (!res.ok) {
        throw new Error(`خطای سرویس Serper (${res.status}): ${res.statusText}`)
      }

      const data = await res.json()
      if (Array.isArray(data.organic)) {
        return data.organic.map((r: { title?: string; link?: string; snippet?: string }) => ({
          title: r.title || 'منبع وب',
          url: r.link || '',
          snippet: r.snippet || '',
        })).filter((s: WebSearchSource) => Boolean(s.url && s.url.startsWith('http')))
      }
      return []
    }

    case 'exa': {
      const endpoint = isDev ? '/api-proxy/exa/search' : 'https://api.exa.ai/search'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': trimmedKey,
        },
        body: JSON.stringify({
          query,
          numResults: 5,
        }),
      })

      if (!res.ok) {
        throw new Error(`خطای سرویس Exa (${res.status}): ${res.statusText}`)
      }

      const data = await res.json()
      if (Array.isArray(data.results)) {
        return data.results.map((r: { title?: string; url?: string; text?: string }) => ({
          title: r.title || 'منبع وب',
          url: r.url || '',
          snippet: r.text || '',
        })).filter((s: WebSearchSource) => Boolean(s.url && s.url.startsWith('http')))
      }
      return []
    }

    case 'jina': {
      const endpoint = `https://s.jina.ai/${encodeURIComponent(query)}`
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
          Accept: 'application/json',
        },
      })

      if (!res.ok) {
        throw new Error(`خطای سرویس Jina (${res.status}): ${res.statusText}`)
      }

      const data = await res.json()
      if (Array.isArray(data.data)) {
        return data.data.map((r: { title?: string; url?: string; description?: string }) => ({
          title: r.title || 'منبع وب',
          url: r.url || '',
          snippet: r.description || '',
        })).filter((s: WebSearchSource) => Boolean(s.url && s.url.startsWith('http')))
      }
      return []
    }

    default:
      return []
  }
}
