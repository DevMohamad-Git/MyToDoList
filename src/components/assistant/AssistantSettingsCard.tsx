import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Textarea,
  Toggle,
  toast,
} from '@/components/ui'
import { useAssistantStore } from '@/stores/assistantStore'
import { fetchProviderModels } from '@/services/ai/providers'
import { testProviderConnection } from '@/services/ai/aiClient'
import type { AIProviderId, SearchProviderId } from '@/types/assistant'
import type { ID } from '@/types'
import { cn } from '@/utils/cn'

interface AssistantSettingsCardProps {
  workspaceId: ID
}

export function AssistantSettingsCard({ workspaceId }: AssistantSettingsCardProps) {
  const {
    settings,
    setActiveProvider,
    setProviderKey,
    setProviderModel,
    setProviderCustomBaseUrl,
    setAvailableModels,
    setProviderStatus,
    setSearchSettings,
    setDirectCreationMode,
    setAutoSwitchOnQuota,
    setCustomInstructions,
    clearConversations,
  } = useAssistantStore()

  const [expandedProvider, setExpandedProvider] = useState<AIProviderId | null>(settings.activeProviderId)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [testingId, setTestingId] = useState<string | null>(null)
  const [fetchingModelsId, setFetchingModelsId] = useState<string | null>(null)
  const [customModelInputs, setCustomModelInputs] = useState<Record<string, string>>({})
  const [isCustomModelActive, setIsCustomModelActive] = useState<Record<string, boolean>>({})

  const toggleShowKey = (id: string) => {
    setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleCopyKey = (key: string) => {
    if (!key) return
    void navigator.clipboard.writeText(key)
    toast.success('کلید کپی شد')
  }

  const handleTestConnection = async (provId: AIProviderId) => {
    const prov = settings.providers[provId]
    if (!prov.apiKey?.trim()) {
      toast.error('لطفاً ابتدا کلید API را وارد کنید.')
      return
    }

    setTestingId(provId)
    const res = await testProviderConnection(prov)
    setTestingId(null)

    if (res.ok) {
      setProviderStatus(provId, 'success')
      toast.success(`اتصال با موفقیت برقرار شد (${res.latencyMs} میلی‌ثانیه).`)
    } else {
      setProviderStatus(provId, 'error', res.error)
      toast.error(res.error || 'خطا در برقراری اتصال.')
    }
  }

  const handleFetchModels = async (provId: AIProviderId) => {
    const prov = settings.providers[provId]
    if (!prov.apiKey?.trim()) {
      toast.error('برای دریافت مدل‌ها، ابتدا کلید API را وارد کنید.')
      return
    }

    setFetchingModelsId(provId)
    try {
      const models = await fetchProviderModels(prov)
      setAvailableModels(provId, models)
      toast.success(`${models.length} مدل با موفقیت از سرور دریافت شد.`)
    } catch (err) {
      toast.error((err as Error).message || 'خطا در دریافت مدل‌ها.')
    } finally {
      setFetchingModelsId(null)
    }
  }

  return (
    <Card className="border-border">
      <CardHeader
        title="دستیار هوشمند و هوش مصنوعی"
        description="مدیریت ارائه‌دهنده‌های هوش مصنوعی، مدل‌ها، کلیدهای دسترسی و جستجوی وب"
        icon={<Sparkles className="size-4 text-accent" />}
      />

      <CardBody className="flex flex-col gap-5 p-4 sm:p-5">
        {/* Privacy & Local Notice */}
        <div className="flex items-start gap-2.5 rounded-xl border border-accent/20 bg-accent/5 p-3 text-xs text-accent">
          <ShieldCheck className="size-4 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong>حفظ حریم خصوصی و محرمانگی:</strong> تمامی داده‌های شما به‌صورت محلی در مرورگر پردازش می‌شوند. تنها پیام‌های گفتگو جهت تحلیل به ارائه‌دهنده انتخاب‌شده ارسال می‌شوند. کلیدهای API صرفاً در حافظه محلی ذخیره شده و هرگز در فایل‌های خروجی و پشتیبان قرار نمی‌گیرند.
          </div>
        </div>

        {/* ------------------------------------------- AI Providers List -- */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">ارائه‌دهنده‌های هوش مصنوعی (AI Providers):</span>
            <span className="text-[11px] text-muted-foreground">یک ارائه‌دهنده را به‌عنوان فعال انتخاب کنید</span>
          </div>

          <div className="space-y-2.5">
            {(Object.keys(settings.providers) as AIProviderId[]).map((provId) => {
              const prov = settings.providers[provId]
              const isSelected = settings.activeProviderId === provId
              const isExpanded = expandedProvider === provId
              const isKeyVisible = Boolean(showKeys[provId])
              const hasKey = Boolean(prov.apiKey?.trim())

              return (
                <div
                  key={provId}
                  className={cn(
                    'rounded-xl border transition-all text-xs',
                    isSelected
                      ? 'border-accent bg-accent/5 shadow-xs'
                      : 'border-border bg-card/60 hover:border-border/80',
                  )}
                >
                  {/* Provider Header Bar */}
                  <div
                    className="flex cursor-pointer items-center justify-between p-3"
                    onClick={() => setExpandedProvider(isExpanded ? null : provId)}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="active-ai-provider"
                        checked={isSelected}
                        onChange={() => setActiveProvider(provId)}
                        onClick={(e) => e.stopPropagation()}
                        className="size-4 text-accent focus:ring-accent"
                      />
                      <span className="font-semibold text-foreground">{prov.name}</span>

                      {isSelected ? (
                        <Badge className="border-accent/40 bg-accent/15 text-accent">
                          فعال
                        </Badge>
                      ) : null}

                      {hasKey ? (
                        <Badge className="hidden sm:inline-flex border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                          دارای کلید
                        </Badge>
                      ) : (
                        <Badge className="hidden sm:inline-flex border-border bg-muted/60 text-muted-foreground">
                          بدون کلید
                        </Badge>
                      )}

                      {prov.lastStatus === 'error' ? (
                        <Badge className="border-rose-500/30 bg-rose-500/10 text-rose-400">
                          خطا
                        </Badge>
                      ) : prov.lastStatus === 'quota_exhausted' ? (
                        <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-500">
                          سهمیه تمام
                        </Badge>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="text-[11px] font-mono hidden md:inline truncate max-w-[180px]">
                        {prov.selectedModel}
                      </span>
                      {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </div>
                  </div>

                  {/* Expanded Body */}
                  {isExpanded ? (
                    <div className="border-t border-border/60 p-3.5 space-y-3 bg-background/40">
                      {/* Free Tier Notes */}
                      {prov.freeTierNotes ? (
                        <div className="rounded-lg bg-muted/40 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
                          💡 <strong>وضعیت سهمیه:</strong> {prov.freeTierNotes}
                        </div>
                      ) : null}

                      {/* API Key Input */}
                      <Field label="کلید API:" htmlFor={`key-${provId}`}>
                        <div className="flex items-center gap-1.5">
                          <Input
                            id={`key-${provId}`}
                            type={isKeyVisible ? 'text' : 'password'}
                            value={prov.apiKey}
                            onChange={(e) => setProviderKey(provId, e.target.value)}
                            placeholder="کلید API خود را اینجا وارد کنید…"
                            className="h-8 text-xs font-mono"
                          />
                          <Button
                            variant="secondary"
                            size="icon-sm"
                            type="button"
                            onClick={() => toggleShowKey(provId)}
                            title={isKeyVisible ? 'پنهان‌سازی' : 'نمایش کلید'}
                          >
                            {isKeyVisible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                          </Button>
                          <Button
                            variant="secondary"
                            size="icon-sm"
                            type="button"
                            onClick={() => handleCopyKey(prov.apiKey)}
                            title="کپی کلید"
                            disabled={!prov.apiKey}
                          >
                            <Copy className="size-3.5" />
                          </Button>
                        </div>
                        {prov.keyUrl ? (
                          <div className="mt-1">
                            <a
                              href={prov.keyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                            >
                              <ExternalLink className="size-2.5" />
                              <span>کلید را از کجا بگیرم؟ ({prov.name})</span>
                            </a>
                          </div>
                        ) : null}
                      </Field>

                      {/* Custom Base URL (for custom provider) */}
                      {provId === 'custom' ? (
                        <Field label="آدرس Base URL:" htmlFor="custom-base-url">
                          <Input
                            id="custom-base-url"
                            value={prov.customBaseUrl || ''}
                            onChange={(e) => setProviderCustomBaseUrl(provId, e.target.value)}
                            placeholder="http://localhost:11434/v1"
                            className="h-8 text-xs font-mono"
                          />
                        </Field>
                      ) : null}

                      {/* Model Selection & Dynamic Fetch (Requirement #4) */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">مدل فعال:</span>
                          <button
                            type="button"
                            onClick={() =>
                              setIsCustomModelActive((prev) => ({ ...prev, [provId]: !prev[provId] }))
                            }
                            className="text-[11px] text-accent hover:underline"
                          >
                            {isCustomModelActive[provId] ? 'انتخاب از لیست' : 'درج دستی نام مدل'}
                          </button>
                        </div>

                        {isCustomModelActive[provId] ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={customModelInputs[provId] ?? prov.selectedModel}
                              onChange={(e) =>
                                setCustomModelInputs({ ...customModelInputs, [provId]: e.target.value })
                              }
                              placeholder="نام مدل دلخواه را بنویسید…"
                              className="h-8 text-xs font-mono"
                            />
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-8 text-xs"
                              onClick={() => {
                                const val = customModelInputs[provId]?.trim()
                                if (val) {
                                  setProviderModel(provId, val, true)
                                  toast.success(`مدل روی ${val} تنظیم شد`)
                                }
                              }}
                            >
                              اعمال
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={prov.selectedModel}
                              onChange={(e) => setProviderModel(provId, e.target.value, false)}
                              className="h-8 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus:border-accent"
                            >
                              {prov.availableModels.map((m) => {
                                const isFree = m.endsWith(':free')
                                return (
                                  <option key={m} value={m}>
                                    {isFree ? `⭐️ [رایگان] ${m}` : m}
                                  </option>
                                )
                              })}
                            </select>

                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-8 gap-1 text-[11px]"
                              disabled={fetchingModelsId === provId || !prov.apiKey}
                              onClick={() => void handleFetchModels(provId)}
                              title="دریافت مدل‌های زنده از Endpoint سرور"
                            >
                              <RefreshCw
                                className={cn('size-3', fetchingModelsId === provId && 'animate-spin')}
                              />
                              <span className="hidden sm:inline">به‌روزرسانی مدل‌ها</span>
                            </Button>
                          </div>
                        )}

                        {/* OpenRouter Paid Model Notice (HTTP 402) */}
                        {provId === 'openrouter' && !prov.selectedModel.endsWith(':free') && (
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-500 leading-relaxed">
                            ⚠️ <strong>توجه به خطای ۴۰۲ (Payment Required):</strong> مدل انتخابی <code>{prov.selectedModel}</code> یک مدل پولی در OpenRouter است و در صورتی که موجودی دلاری حسابتان صفر باشد، سرور خطای ۴۰۲ می‌دهد. جهت استفاده کاملاً رایگان، یکی از مدل‌های دارای برچسب <strong>⭐️ [رایگان]</strong> (با پسوند <code>:free</code>) مانند <code>meta-llama/llama-3.3-70b-instruct:free</code> یا <code>google/gemini-2.0-flash-exp:free</code> را انتخاب کنید.
                          </div>
                        )}

                        {/* Gemini Geo-Restriction Notice */}
                        {provId === 'gemini' && (
                          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-2.5 text-[11px] text-blue-400 leading-relaxed">
                            ℹ️ <strong>نکته اتصال گوگل Gemini:</strong> گوگل دسترسی به AI Studio را برای برخی مناطق جغرافیایی (مانند ایران) محدود کرده است (خطای <code>User location is not supported</code>). اگر با این خطا مواجه شدید، از ابزار تغییر IP استفاده کنید، یا می‌توانید همان مدل Gemini را به‌صورت رایگان از طریق ارائه‌دهنده <strong>OpenRouter</strong> و انتخاب مدل <code>google/gemini-2.0-flash-exp:free</code> فراخوانی نمایید.
                          </div>
                        )}
                      </div>

                      {/* Connection Test Button */}
                      <div className="flex items-center justify-between border-t border-border/40 pt-2.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="gap-1 text-xs"
                          disabled={testingId === provId || !prov.apiKey}
                          onClick={() => void handleTestConnection(provId)}
                        >
                          <Zap className={cn('size-3 text-amber-500', testingId === provId && 'animate-pulse')} />
                          <span>تست اتصال</span>
                        </Button>

                        {prov.lastError ? (
                          <span className="text-[11px] text-rose-400 truncate max-w-xs">{prov.lastError}</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        {/* ----------------------------------------- Web Search Settings -- */}
        <div className="space-y-3 rounded-xl border border-border bg-card p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Globe className="size-4 text-accent" />
            <span>جستجوی اینترنت (Web Search):</span>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            جهت استخراج لینک‌های آموزشی، مقالات و منابع موثق، دستیار می‌تواند از موتورهای جستجو استفاده کند. لینک‌ها فقط از نتایج معتبر استخراج می‌شوند.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="موتور جستجو:" htmlFor="search-prov">
              <select
                id="search-prov"
                value={settings.search.provider}
                onChange={(e) => setSearchSettings({ provider: e.target.value as SearchProviderId })}
                className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground"
              >
                <option value="tavily">Tavily (پیشنهادی - ۱۰۰۰ سرچ ماهانه رایگان)</option>
                <option value="serper">Serper (۲۵۰۰ سرچ رایگان گوگل)</option>
                <option value="exa">Exa Search</option>
                <option value="jina">Jina Search</option>
              </select>
            </Field>

            <Field label="کلید API جستجو:" htmlFor="search-key">
              <div className="flex items-center gap-1.5">
                <Input
                  id="search-key"
                  type={showKeys['search'] ? 'text' : 'password'}
                  value={settings.search.apiKey}
                  onChange={(e) => setSearchSettings({ apiKey: e.target.value })}
                  placeholder="کلید Tavily / Serper را وارد کنید…"
                  className="h-8 text-xs font-mono"
                />
                <Button
                  variant="secondary"
                  size="icon-sm"
                  type="button"
                  onClick={() => toggleShowKey('search')}
                >
                  {showKeys['search'] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
              </div>
            </Field>
          </div>

          <div className="border-t border-border/40 pt-2">
            <Toggle
              checked={settings.search.enabledDefault}
              onChange={(checked) => setSearchSettings({ enabledDefault: checked })}
              label="جستجوی پیش‌فرض"
              description="جستجوی وب در گفتگوهای جدید به‌صورت پیش‌فرض روشن باشد"
            />
          </div>
        </div>

        {/* --------------------------------- Preferences & Direct Mode -- */}
        <div className="space-y-3 rounded-xl border border-border bg-card p-3.5 text-xs">
          <div className="font-semibold text-foreground">رفتار و ترجیحات دستیار:</div>

          {/* Direct Mode Toggle */}
          <div className="border-b border-border/40 pb-2">
            <Toggle
              checked={settings.directCreationMode}
              onChange={setDirectCreationMode}
              label="حالت ساخت مستقیم (Direct Creation)"
              description="ساخت کارهای کوچک بدون کارت پیش‌نمایش درجا انجام شده و دکمه واگردانی نمایش می‌یابد."
            />
          </div>

          {/* Auto Switch on Quota */}
          <div className="border-b border-border/40 pb-2">
            <Toggle
              checked={settings.autoSwitchOnQuota}
              onChange={setAutoSwitchOnQuota}
              label="تغییر خودکار در صورت اتمام سهمیه"
              description="اگر سهمیه ارائه‌دهنده فعلی تمام شد، خودکار به ارائه‌دهنده بعدی دارای کلید سوئیچ شود."
            />
          </div>

          {/* Custom System Instructions */}
          <Field label="دستورالعمل‌های اختصاصی به دستیار (اختیاری):" htmlFor="custom-instructions">
            <Textarea
              id="custom-instructions"
              rows={2}
              value={settings.customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="مثلاً: همیشه زمان‌های تخمینی را کمتر از ۴۵ دقیقه در نظر بگیر..."
              className="text-xs"
            />
          </Field>
        </div>

        {/* ------------------------------------------- Clear History -- */}
        <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
          <div>
            <div className="font-medium text-foreground">تاریخچه گفتگوها:</div>
            <div className="text-[11px] text-muted-foreground">
              تمامی مکالمات در دیتابیس محلی ذخیره شده و پس از ۳۰ روز خودکار پاک می‌شوند.
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
            onClick={async () => {
              await clearConversations(workspaceId)
              toast.success('تاریخچه گفتگوها پاک‌سازی شد.')
            }}
          >
            پاک‌سازی تاریخچه گفتگوها
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}
