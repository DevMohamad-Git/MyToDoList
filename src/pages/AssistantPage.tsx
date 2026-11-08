import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUp,
  Globe,
  History,
  MessageSquare,
  Plus,
  Settings,
  Sparkles,
  StopCircle,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import {
  Button,
  toast,
} from '@/components/ui'
import { QuestionCard } from '@/components/assistant/QuestionCard'
import { TreePreviewCard } from '@/components/assistant/TreePreviewCard'
import { DiffPreviewCard } from '@/components/assistant/DiffPreviewCard'
import { useAssistantStore } from '@/stores/assistantStore'
import { useWorkspace } from '@/stores/workspace'
import type { AIProviderId } from '@/types/assistant'
import { cn } from '@/utils/cn'

const STARTER_PROMPTS = [
  {
    title: 'ساخت پروژه‌ی سفر',
    desc: 'یک پروژه‌ی سفر ۵ روزه با رزروها و کارهای آماده‌سازی',
    prompt: 'یه پروژه‌ی سفر ۵ روزه با کارها و چک‌لیست آماده‌سازی برام بساز',
  },
  {
    title: 'برنامه‌ریزی روزانه',
    desc: 'چیدن کارهای باز در ساعت‌های کاری امروز',
    prompt: 'امروزم رو بر اساس کارهای باز برنامه‌ریزی کن',
  },
  {
    title: 'انتقال کارهای عقب‌افتاده',
    desc: 'جابه‌جایی موعد تسک‌های گذشته به فردا',
    prompt: 'همه‌ی کارهای عقب‌افتاده رو بفرست برای فردا',
  },
  {
    title: 'گزارش تمرکز و کارها',
    desc: 'خلاصه ساعت‌های تمرکز و عملکرد این هفته',
    prompt: 'این هفته چقدر تمرکز داشتم و وضعیت کارهام چطوره؟',
  },
]

export function AssistantPage() {
  const workspace = useWorkspace()
  const [searchParams, setSearchParams] = useSearchParams()

  const [input, setInput] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const {
    settings,
    conversations,
    activeConversationId,
    isGenerating,
    activeError,
    loadConversations,
    createConversation,
    selectConversation,
    deleteConversation,
    clearConversations,
    toggleConversationWebSearch,
    setActiveProvider,
    setProviderModel,
    sendMessage,
    submitAnswers,
    applyProposalAction,
    rollbackProposalAction,
    cancelProposalAction,
    stopGenerating,
  } = useAssistantStore()

  // Initialize conversations from IndexedDB
  useEffect(() => {
    void loadConversations(workspace.id)
  }, [workspace.id, loadConversations])

  // Scroll to bottom on new messages
  const activeConv = conversations.find((c) => c.id === activeConversationId)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConv?.messages.length, isGenerating])

  // Handle URL query prompt parameter
  useEffect(() => {
    const promptParam = searchParams.get('prompt')
    if (promptParam?.trim()) {
      setInput(promptParam)
      textareaRef.current?.focus()
      // Remove query param to prevent re-populating on refresh
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isGenerating) return
    setInput('')
    await sendMessage(workspace.id, trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleNewChat = async () => {
    await createConversation(workspace.id)
    textareaRef.current?.focus()
  }

  const activeProvider = settings.providers[settings.activeProviderId]
  const hasApiKey = Boolean(activeProvider?.apiKey?.trim())

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* ---------------------------------------------------- Header -- */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">دستیار هوشمند FlowOS</h1>
            <p className="text-[11px] text-muted-foreground">برنامه‌ریزی، ساخت خودکار و تحلیل داده‌ها</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Active provider & model selector */}
          <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs">
            <span className="text-muted-foreground">سرویس:</span>
            <select
              value={settings.activeProviderId}
              onChange={(e) => setActiveProvider(e.target.value as AIProviderId)}
              className="bg-transparent font-medium text-foreground focus:outline-hidden"
            >
              {Object.values(settings.providers).map((prov) => (
                <option key={prov.id} value={prov.id}>
                  {prov.name} {prov.apiKey ? '✓' : '(بدون کلید)'}
                </option>
              ))}
            </select>

            <span className="text-border">|</span>

            <span className="text-muted-foreground">مدل:</span>
            <select
              value={activeProvider?.selectedModel}
              onChange={(e) => setProviderModel(settings.activeProviderId, e.target.value, false)}
              className="bg-transparent font-medium text-foreground focus:outline-hidden max-w-[170px] truncate"
              title={activeProvider?.selectedModel}
            >
              {activeProvider?.availableModels.map((m) => {
                const isFree = m.endsWith(':free')
                return (
                  <option key={m} value={m}>
                    {isFree ? `⭐️ ${m.replace(':free', ' (رایگان)')}` : m}
                  </option>
                )
              })}
            </select>
          </div>

          {/* History drawer toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setHistoryOpen(!historyOpen)}
            title="تاریخچه گفتگوها"
          >
            <History className="size-3.5" />
            <span className="hidden md:inline">تاریخچه</span>
          </Button>

          {/* New chat button */}
          <Button variant="secondary" size="sm" className="gap-1 text-xs" onClick={handleNewChat}>
            <Plus className="size-3.5" />
            <span>گفتگوی جدید</span>
          </Button>

          {/* Link to settings */}
          <Link to="/settings">
            <Button variant="ghost" size="icon-sm" title="تنظیمات دستیار">
              <Settings className="size-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* ------------------------------------------------ Main Content -- */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Chat Stream Area */}
        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
          {/* API Key Missing Alert */}
          {!hasApiKey ? (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-500">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>
                    کلید API برای ارائه‌دهنده <strong>{activeProvider?.name}</strong> وارد نشده است. برای پاسخ‌دهی دستیار، کلید را در تنظیمات وارد کنید.
                  </span>
                </div>
                <Link to="/settings">
                  <Button size="sm" variant="secondary" className="h-7 text-xs">
                    تنظیم کلید
                  </Button>
                </Link>
              </div>
            </div>
          ) : null}

          {/* OpenRouter Paid Model Notice (HTTP 402) */}
          {hasApiKey && activeProvider?.id === 'openrouter' && !activeProvider.selectedModel.endsWith(':free') ? (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>
                    مدل انتخابی <strong>{activeProvider.selectedModel}</strong> در OpenRouter پولی است و به اعتبار دلاری نیاز دارد. اگر خطای ۴۰۲ دریافت می‌کنید، روی دکمه زیر بزنید تا مدل رایگان تنظیم شود.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs shrink-0 self-start sm:self-auto"
                  onClick={() => setProviderModel('openrouter', 'meta-llama/llama-3.3-70b-instruct:free', false)}
                >
                  تغییر به مدل رایگان LLaMA 3.3
                </Button>
              </div>
            </div>
          ) : null}

          {/* Empty State / Welcome Screen */}
          {(!activeConv || activeConv.messages.length === 0) && (
            <div className="my-auto flex flex-col items-center justify-center text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-accent/15 text-accent shadow-xs">
                <Sparkles className="size-7" />
              </div>
              <h2 className="mt-3 text-base font-bold text-foreground">چطور می‌تونم کمکت کنم؟</h2>
              <p className="mt-1 max-w-md text-xs text-muted-foreground leading-relaxed">
                می‌تونی بگی یک پروژه با کارهاش بسازم، روزت رو برنامه‌ریزی کنم، یا درباره زمان تمرکز و عادت‌هات سؤال بپرسی.
              </p>

              {/* Starter cards */}
              <div className="mt-6 grid max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2 text-start">
                {STARTER_PROMPTS.map((starter, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setInput(starter.prompt)
                      textareaRef.current?.focus()
                    }}
                    className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 transition-all hover:border-accent/40 hover:bg-muted/40 hover:shadow-xs"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Sparkles className="size-3 text-accent" />
                      <span>{starter.title}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground leading-snug">{starter.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages List */}
          {activeConv && activeConv.messages.length > 0 && (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-4">
              {activeConv.messages.map((msg) => {
                const isUser = msg.role === 'user'

                return (
                  <div
                    key={msg.id}
                    className={cn('flex gap-2.5', isUser ? 'flex-row-reverse self-end' : 'self-start')}
                  >
                    {!isUser ? (
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                        <Sparkles className="size-3.5" />
                      </div>
                    ) : null}

                    <div
                      className={cn(
                        'flex max-w-[85%] flex-col gap-1.5 rounded-2xl p-3.5 text-xs sm:text-sm leading-relaxed',
                        isUser
                          ? 'rounded-tr-xs bg-accent text-accent-foreground'
                          : 'rounded-tl-xs border border-border/80 bg-card text-foreground shadow-xs',
                      )}
                    >
                      {/* Message text */}
                      <div className="whitespace-pre-wrap">{msg.content}</div>

                      {/* Web Search Sources */}
                      {msg.sources && msg.sources.length > 0 ? (
                        <div className="mt-2 flex flex-col gap-1 border-t border-border/60 pt-2 text-[11px]">
                          <div className="flex items-center gap-1 font-semibold text-accent">
                            <Globe className="size-3" />
                            <span>منابع و استنادهای وب:</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {msg.sources.map((src, sIdx) => (
                              <a
                                key={sIdx}
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <ExternalLink className="size-2.5" />
                                <span className="max-w-[150px] truncate">{src.title}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {/* Interactive Question Card */}
                      {msg.questions && msg.questions.length > 0 ? (
                        <QuestionCard
                          questions={msg.questions}
                          selectedAnswers={msg.selectedAnswers}
                          onSubmit={(answers) => void submitAnswers(workspace.id, msg.id, answers)}
                          disabled={isGenerating}
                        />
                      ) : null}

                      {/* Proposal Preview Card */}
                      {msg.proposal ? (
                        msg.proposal.type === 'create_project_tasks' ? (
                          <TreePreviewCard
                            proposal={msg.proposal}
                            actionStatus={msg.actionStatus}
                            createdProjectId={msg.proposal.project ? 'created' : undefined}
                            onConfirm={async (modified) => {
                              const res = await applyProposalAction(workspace.id, msg.id, modified)
                              if (res.success) {
                                toast.success(res.message)
                              } else {
                                toast.error(res.message)
                              }
                            }}
                            onRollback={async () => {
                              const success = await rollbackProposalAction(workspace.id, msg.id)
                              if (success) {
                                toast.success('عملیات با موفقیت واگردانی شد.')
                              } else {
                                toast.error('خطا در واگردانی.')
                              }
                            }}
                            onCancel={() => void cancelProposalAction(workspace.id, msg.id)}
                            onRequestChanges={() => {
                              setInput('لطفاً در ساخت این پروژه این تغییرات را اعمال کن: ')
                              textareaRef.current?.focus()
                            }}
                            isProcessing={isGenerating}
                          />
                        ) : (
                          <DiffPreviewCard
                            proposal={msg.proposal}
                            actionStatus={msg.actionStatus}
                            onConfirm={async (modified) => {
                              const res = await applyProposalAction(workspace.id, msg.id, modified)
                              if (res.success) {
                                toast.success(res.message)
                              } else {
                                toast.error(res.message)
                              }
                            }}
                            onRollback={async () => {
                              const success = await rollbackProposalAction(workspace.id, msg.id)
                              if (success) {
                                toast.success('عملیات با موفقیت واگردانی شد.')
                              } else {
                                toast.error('خطا در واگردانی.')
                              }
                            }}
                            onCancel={() => void cancelProposalAction(workspace.id, msg.id)}
                            isProcessing={isGenerating}
                          />
                        )
                      ) : null}
                    </div>
                  </div>
                )
              })}

              {/* Generating / Typing Indicator */}
              {isGenerating ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                    <Sparkles className="size-3.5 animate-spin" />
                  </div>
                  <span>دستیار در حال تفکر و تنظیم پاسخ است…</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-1 px-2 text-[10px] text-rose-400 hover:text-rose-300"
                    onClick={stopGenerating}
                  >
                    <StopCircle className="size-3" />
                    <span>توقف</span>
                  </Button>
                </div>
              ) : null}

              {/* Global Error Banner */}
              {activeError ? (
                <div className="flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>{activeError}</span>
                  </div>
                  <Button size="sm" variant="secondary" className="h-6 text-[10px]" onClick={handleSend}>
                    تلاش دوباره
                  </Button>
                </div>
              ) : null}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ------------------------------------------- History Sidebar Drawer -- */}
        {historyOpen ? (
          <div className="absolute inset-y-0 start-0 z-20 flex w-72 flex-col border-e border-border bg-card p-3 shadow-xl sm:static">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">گفتگوهای اخیر</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[11px] text-rose-400 hover:text-rose-300"
                onClick={() => void clearConversations(workspace.id)}
              >
                پاک‌سازی همه
              </Button>
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">هنوز گفتگویی ثبت نشده است.</div>
              ) : (
                conversations.map((conv) => {
                  const isActive = conv.id === activeConversationId
                  return (
                    <div
                      key={conv.id}
                      onClick={() => {
                        selectConversation(conv.id)
                        setHistoryOpen(false)
                      }}
                      className={cn(
                        'group flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors',
                        isActive
                          ? 'bg-accent/15 font-semibold text-accent'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <MessageSquare className="size-3.5 shrink-0" />
                        <span className="truncate">{conv.title || 'گفتگوی بدون عنوان'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          void deleteConversation(workspace.id, conv.id)
                        }}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-400"
                        title="حذف گفتگو"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>

            <div className="border-t border-border pt-2 text-[10px] text-muted-foreground">
              گفتگوها در پایگاه‌داده محلی مرورگر شما ذخیره شده و پس از ۳۰ روز به‌صورت خودکار پاک می‌شوند.
            </div>
          </div>
        ) : null}
      </div>

      {/* -------------------------------------------------- Input Area -- */}
      <div className="shrink-0 border-t border-border bg-card p-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {/* Controls bar above textarea */}
          <div className="flex items-center justify-between text-xs">
            {/* Web Search Toggle */}
            <button
              type="button"
              onClick={() => {
                if (activeConv) {
                  toggleConversationWebSearch(activeConv.id)
                }
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                activeConv?.webSearchEnabled
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'bg-muted/40 text-muted-foreground hover:text-foreground border border-transparent',
              )}
              title="جستجوی اینترنت برای یافتن لینک‌ها و منابع آموزشی واقعی"
            >
              <Globe className="size-3" />
              <span>جستجوی وب: {activeConv?.webSearchEnabled ? 'روشن' : 'خاموش'}</span>
            </button>

            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              Enter برای ارسال، Shift+Enter برای خط جدید
            </span>
          </div>

          {/* Text input & Send button */}
          <div className="relative flex items-end rounded-xl border border-border bg-background focus-within:border-accent">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="درخواست خود را برای ساخت یا برنامه‌ریزی بنویسید…"
              className="w-full max-h-32 min-h-[44px] resize-none border-0 bg-transparent py-2.5 ps-3 pe-12 text-xs sm:text-sm focus:outline-none focus:ring-0 shadow-none text-foreground placeholder:text-muted-foreground"
            />
            <div className="absolute end-1.5 bottom-1.5">
              <Button
                variant="primary"
                size="icon-sm"
                disabled={!input.trim() || isGenerating}
                onClick={handleSend}
                aria-label="ارسال پیام"
              >
                <ArrowUp className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
