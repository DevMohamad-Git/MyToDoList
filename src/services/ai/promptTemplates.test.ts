import { describe, expect, it } from 'vitest'
import { validateAndParseResponse } from './promptTemplates'

describe('promptTemplates - validateAndParseResponse', () => {
  it('parses valid raw JSON response', () => {
    const raw = JSON.stringify({
      message: 'برنامه‌ریزی شما انجام شد.',
      proposal: {
        type: 'create_project_tasks',
        assumptions: ['سفر ۳ روزه است'],
        tasks: [{ title: 'خرید بلیط', priority: 'high', estimatedDuration: 20 }],
      },
    })

    const { parsed, error } = validateAndParseResponse(raw, new Set())
    expect(error).toBeUndefined()
    expect(parsed?.message).toBe('برنامه‌ریزی شما انجام شد.')
    expect(parsed?.proposal?.tasks?.[0].title).toBe('خرید بلیط')
  })

  it('parses markdown-fenced JSON response', () => {
    const raw = `
متن قبل از کد
\`\`\`json
{
  "message": "پیشنهاد سفر:",
  "questions": [
    {
      "id": "q1",
      "text": "مدت سفر؟",
      "options": ["۳ روز", "۷ روز"]
    }
  ]
}
\`\`\`
متن بعد از کد
`

    const { parsed, error } = validateAndParseResponse(raw, new Set())
    expect(error).toBeUndefined()
    expect(parsed?.questions?.length).toBe(1)
    expect(parsed?.questions?.[0].options).toEqual(['۳ روز', '۷ روز'])
  })

  it('strictly strips hallucinated URLs (Requirement #2)', () => {
    const raw = JSON.stringify({
      message: 'کارهای سفر',
      proposal: {
        type: 'create_project_tasks',
        tasks: [
          {
            title: 'آموزش زبان',
            priority: 'medium',
            links: [
              { label: 'آموزش جعلی', url: 'https://fake-hallucinated-site.com/video123' },
              { label: 'ویکی‌پدیا مجاز', url: 'https://fa.wikipedia.org/wiki/Travel' },
            ],
          },
        ],
      },
    })

    // Only https://fa.wikipedia.org/wiki/Travel is in the verified search results
    const allowedUrls = new Set(['https://fa.wikipedia.org/wiki/Travel'])

    const { parsed } = validateAndParseResponse(raw, allowedUrls)
    const taskLinks = parsed?.proposal?.tasks?.[0].links

    expect(taskLinks?.length).toBe(1)
    expect(taskLinks?.[0].url).toBe('https://fa.wikipedia.org/wiki/Travel')
    expect(taskLinks?.find((l) => l.url.includes('fake-hallucinated-site'))).toBeUndefined()
  })

  it('returns error when JSON is invalid', () => {
    const raw = 'این یک متن بدون ساختار JSON است'
    const { parsed, error } = validateAndParseResponse(raw, new Set())
    expect(parsed).toBeUndefined()
    expect(error).toBeDefined()
  })
})
