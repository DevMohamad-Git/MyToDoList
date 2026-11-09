import type { AssistantProposal, AssistantQuestion, WebSearchSource } from '@/types/assistant'
import type { WorkspaceDataSummary } from './queryData'

export interface AssistantApiResponse {
  message: string
  questions?: AssistantQuestion[]
  proposal?: AssistantProposal
}

export function buildSystemPrompt(
  workspaceData: WorkspaceDataSummary,
  customInstructions?: string,
  webResults?: WebSearchSource[],
): string {
  const existingProjectsStr = workspaceData.projects
    .map((p) => `- ${p.name} (شناسه: ${p.id}, وضعیت: ${p.status})`)
    .join('\n')

  const existingGoalsStr = (workspaceData.goals || [])
    .map((g) => {
      const typeStr =
        g.targetType === 'financial'
          ? `مالی، هدف: ${(g.targetAmount ?? 0).toLocaleString()} ${g.unit || 'تومان'}، موجودی فعلی: ${(g.currentAmount ?? 0).toLocaleString()} ${g.unit || 'تومان'}`
          : g.targetType === 'metric'
            ? `مقداری/عددی، هدف: ${(g.targetAmount ?? 0).toLocaleString()} ${g.unit || ''}، مقدار فعلی: ${(g.currentAmount ?? 0).toLocaleString()} ${g.unit || ''}`
            : g.targetType || 'استاندارد'
      return `- ${g.title} (شناسه: ${g.id}، وضعیت: ${g.status}، نوع: ${typeStr})`
    })
    .join('\n')

  const existingTagsStr = workspaceData.existingTags.join('، ')

  const webResultsStr =
    webResults && webResults.length > 0
      ? `\nنتایج جستجوی واقعی در وب (تنها منابع مجاز برای لینک):
${webResults.map((r, i) => `[${i + 1}] عنوان: ${r.title}\nلینک: ${r.url}\nخلاصه: ${r.snippet}`).join('\n\n')}`
      : '\nنتایج جستجوی وب: وجود ندارد یا جستجو خاموش بوده است.'

  return `شما «دستیار هوشمند FlowOS» هستید؛ یک دستیار بهره‌وری شخصی، بومی، دقیق و دوستانه به زبان فارسی.
وظیفه شما کمک به کاربر در برنامه‌ریزی کارها، ساخت پروژه‌ها، تنظیم عادات و اهداف، ثبت واریز و برداشت اهداف مالی، و ارائه پاسخ‌های تحلیلی درباره کارها و تمرکز است.

اطلاعات فضای کاری فعلی کاربر:
- امروز به شمسی: ${workspaceData.todayJalali} (معادل میلادی: ${workspaceData.todayGregorian})
- تعداد کارهای باز: ${workspaceData.tasks.open} (شامل ${workspaceData.tasks.inbox} در صندوق ورودی، ${workspaceData.tasks.overdue} عقب‌افتاده، ${workspaceData.tasks.blocked} مسدود)
- کارهای تکمیل‌شده امروز: ${workspaceData.tasks.completedToday}
- زمان تمرکز امروز: ${workspaceData.focus.todayFormatted} (۷ روز اخیر: ${workspaceData.focus.past7DaysFormatted})
- پروژه‌های موجود:
${existingProjectsStr || 'پروژه‌ای وجود ندارد'}
- اهداف موجود:
${existingGoalsStr || 'هدفی ثبت نشده است'}
- برچسب‌های موجود: ${existingTagsStr || 'برچسبی وجود ندارد'}
${webResultsStr}

${customInstructions ? `دستورالعمل‌های اختصاصی کاربر:\n${customInstructions}\n` : ''}

قوانین حیاتی:
۱. خروجی شما باید منحصراً یک ساختار JSON معتبر و استاندارد باشد (درون تگ \`\`\`json ... \`\`\` یا به‌صورت JSON خام). هیچ متنی بیرون از ساختار JSON ننویسید.
۲. «اول بپرس، بعد بساز»: اگر درخواست کاربر کلی، مبهم یا چندوجهی است (مثل «یه پروژه سفر بساز» یا «می‌خوام زبان یاد بگیرم»)، قبل از پیشنهاد پروژه، ۲ تا ۴ سؤال کوتاه با گزینه‌های کلیک‌پذیر در آرایه questions برگردانید. از پرسیدن مواردی که در دیتابیس موجود است (مانند پروژه‌های کاربر) خودداری کنید.
۳. «لینک‌های واقعی و معتبر»: شما اکیداً حق درج لینک‌های ساختگی، تخیلی یا حدسی (مثل youtube.com/watch?v=123 یا site.com) را ندارید. فیلد links در تسک‌ها منحصراً و فقط باید حاوی URLهایی باشد که در نتایج جستجوی واقعی بالا لیست شده‌اند! اگر نتایج جستجوی وب خالی است، فیلد links را خالی بگذارید ([]).
۴. تاریخ‌ها: تمام فیلدهای تاریخ (dueDate, deadline, startDate) باید با فرمت ISO-8601 (مثل 2026-11-20T18:00:00.000Z) با در نظر گرفتن تاریخ امروز (${workspaceData.todayGregorian}) تولید شوند.
۵. عدم تکرار: از نام پروژه‌ها و برچسب‌های موجود استفاده کنید و داده‌های تکراری نسازید.
۶. پاسخ‌های تحلیلی: برای سؤالات درباره کارها، آمارها و تمرکز (مثل «امروز چقدر تمرکز داشتم؟»)، نیازی به ساخت proposal نیست و فقط فیلد message را با آمارهای دقیق و روان پر کنید.
۷. اهداف مالی و تراکنش‌ها (واریز و برداشت):
اگر کاربر خواست برای یک هدف مالی واریز، برداشت یا تراکنشی ثبت کند، از proposal نوع "goal_transaction" استفاده کنید. شناسه هدف را از بخش «اهداف موجود» بیابید. تراکنش‌ها دارای فیلدهای type ("deposit" یا "withdrawal") و amount (عدد به تومان یا واحد هدف) هستند.
اگر کاربر خواست هدف مالی جدید بسازد، از نوع "create_goal" با فیلدهای targetType: "financial" و targetAmount و unit ("تومان") استفاده کنید.

فرمت مورد انتظار JSON برای تراکنش هدف مالی:
{
  "message": "پیشنهاد ثبت واریز ۳۰ میلیون و برداشت ۲۵ میلیون برای هدف مالی...",
  "proposal": {
    "type": "goal_transaction",
    "assumptions": ["واریز ۳۰ میلیون و برداشت ۲۵ میلیون به هدف"],
    "goalTransaction": {
      "goalId": "شناسه_هدف_موجود",
      "goalTitle": "عنوان هدف",
      "transactions": [
        { "type": "deposit", "amount": 30000000, "note": "واریز" },
        { "type": "withdrawal", "amount": 25000000, "note": "برداشت" }
      ]
    }
  }
}

فرمت مورد انتظار JSON برای پروژه‌ها و تسک‌ها:
{
  "message": "متن توضیحات یا پاسخ شما به زبان فارسی...",
  "questions": [
    {
      "id": "q1",
      "text": "مدت سفرت چند روزه؟",
      "options": ["۳ روزه", "یک هفته", "۱۰ روز یا بیشتر"]
    }
  ],
  "proposal": {
    "type": "create_project_tasks",
    "assumptions": ["فرض شده که سفر ۵ روزه است"],
    "project": {
      "name": "عنوان پروژه",
      "description": "توضیح کوتاه",
      "color": "#3b82f6",
      "icon": "plane",
      "deadline": "2026-11-25T18:00:00.000Z"
    },
    "tasks": [
      {
        "title": "رزرو هتل",
        "description": "بررسی نظرات و رزرو اتاق",
        "estimatedDuration": 30,
        "priority": "high",
        "dueDate": "2026-11-22T18:00:00.000Z",
        "tags": ["سفر"],
        "links": [
          { "label": "سایت علی‌بابا", "url": "https://www.alibaba.ir" }
        ],
        "subtasks": [
          { "title": "مقایسه قیمت‌ها", "estimatedDuration": 15 }
        ]
      }
    ]
  }
}
`
}

/**
 * Validate and safely parse the model's response.
 * Enforces requirement #2: Real search results only (strips any unverified URL).
 */
export function validateAndParseResponse(
  rawText: string,
  allowedUrls: Set<string>,
): { parsed?: AssistantApiResponse; error?: string } {
  if (!rawText || !rawText.trim()) {
    return { error: 'پاسخی از مدل دریافت نشد.' }
  }

  let jsonStr = rawText.trim()

  // Extract from markdown code fences if wrapped
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/
  const match = codeBlockRegex.exec(jsonStr)
  if (match) {
    jsonStr = match[1].trim()
  } else {
    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1)
    }
  }

  try {
    const parsed = JSON.parse(jsonStr) as AssistantApiResponse

    if (!parsed || typeof parsed !== 'object') {
      return { error: 'فرمت پاسخ مدل شیء JSON معتبر نیست.' }
    }

    if (typeof parsed.message !== 'string') {
      parsed.message = 'پیشنهاد دستیار:'
    }

    // Validate and sanitize questions
    if (Array.isArray(parsed.questions)) {
      parsed.questions = parsed.questions
        .filter((q) => q && typeof q.text === 'string' && Array.isArray(q.options) && q.options.length > 0)
        .map((q, idx) => ({
          id: q.id || `q_${idx + 1}`,
          text: q.text,
          options: q.options.filter((o) => typeof o === 'string' && o.trim().length > 0),
          allowCustom: q.allowCustom ?? true,
          allowDecideForMe: q.allowDecideForMe ?? true,
        }))
      if (parsed.questions.length === 0) {
        delete parsed.questions
      }
    }

    // Validate and sanitize proposals & filter hallucinated URLs
    if (parsed.proposal && typeof parsed.proposal === 'object') {
      const p = parsed.proposal
      p.assumptions = Array.isArray(p.assumptions) ? p.assumptions.filter(Boolean) : []

      if (Array.isArray(p.tasks)) {
        p.tasks = p.tasks.map((t) => {
          // Strictly enforce: ONLY URLs in allowedUrls from real search results are kept
          const verifiedLinks = Array.isArray(t.links)
            ? t.links.filter((link) => {
                if (!link || typeof link.url !== 'string') return false
                const normalized = link.url.trim().toLowerCase()
                return Array.from(allowedUrls).some((allowed) => {
                  const normAllowed = allowed.trim().toLowerCase()
                  return normalized === normAllowed || normalized.startsWith(normAllowed) || normAllowed.startsWith(normalized)
                })
              })
            : []

          return {
            ...t,
            enabled: true,
            priority: ['critical', 'high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium',
            links: verifiedLinks,
            subtasks: Array.isArray(t.subtasks)
              ? t.subtasks.filter((st) => st && typeof st.title === 'string' && st.title.trim().length > 0)
              : [],
          }
        })
      }

      if (Array.isArray(p.habits)) {
        p.habits = p.habits.map((h) => ({
          ...h,
          enabled: true,
          target: typeof h.target === 'number' && h.target > 0 ? h.target : 1,
          frequency: ['daily', 'weekly', 'custom'].includes(h.frequency) ? h.frequency : 'daily',
        }))
      }

      if (Array.isArray(p.edits)) {
        p.edits = p.edits.map((e) => ({ ...e, enabled: true }))
      }

      if (Array.isArray(p.scheduleSlots)) {
        p.scheduleSlots = p.scheduleSlots.map((s) => ({ ...s, enabled: true }))
      }

      if (p.goalTransaction && typeof p.goalTransaction === 'object') {
        const gt = p.goalTransaction
        if (Array.isArray(gt.transactions)) {
          gt.transactions = gt.transactions
            .filter((tx) => tx && typeof tx.amount === 'number' && tx.amount > 0)
            .map((tx) => ({
              type: tx.type === 'withdrawal' ? 'withdrawal' : 'deposit',
              amount: Number(tx.amount),
              note: tx.note ? String(tx.note).trim() : '',
            }))
        }
      }
    }

    return { parsed }
  } catch (err) {
    return { error: `خطا در پارس کردن ساختار JSON مدل: ${(err as Error).message}` }
  }
}
