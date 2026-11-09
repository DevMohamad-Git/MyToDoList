import {
  AlertCircle,
  Award,
  CheckCircle2,
  Clock,
  Flame,
  HelpCircle,
  Lightbulb,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import {
  Badge,
  Button,
  Modal,
  ProgressBar,
} from '@/components/ui'
import type { ScoreComponent, ScoreResult } from '@/services/scoring'
import { ratingColor } from '@/services/scoring'
import { ratingLabel, useT } from '@/i18n'
import { cn } from '@/utils/cn'

interface ScoreBreakdownModalProps {
  open: boolean
  onClose: () => void
  scoreResult?: ScoreResult
  title?: string
  subtitle?: string
}

export function ScoreBreakdownModal({
  open,
  onClose,
  scoreResult,
  title = 'تحلیل و جزئیات امتیاز عملکرد',
  subtitle,
}: ScoreBreakdownModalProps) {
  const t = useT()

  if (!scoreResult) return null

  const { score, rating, components, noData } = scoreResult
  const roundedScore = Math.round(score)

  // Map component key to Persian translation and icon
  const componentMeta: Record<
    string,
    { label: string; description: string; icon: typeof CheckCircle2 }
  > = {
    taskCompletion: {
      label: t('compTaskCompletion'),
      description: t('compTaskCompletionHelp'),
      icon: CheckCircle2,
    },
    priorityCompletion: {
      label: t('compPriorityCompletion'),
      description: t('compPriorityCompletionHelp'),
      icon: TrendingUp,
    },
    deadlineDiscipline: {
      label: t('compDeadlineDiscipline'),
      description: t('compDeadlineDisciplineHelp'),
      icon: ShieldCheck,
    },
    timeEfficiency: {
      label: t('compTimeEfficiency'),
      description: t('compTimeEfficiencyHelp'),
      icon: Clock,
    },
    focusTime: {
      label: t('compFocusTime'),
      description: t('compFocusTimeHelp'),
      icon: Award,
    },
    consistency: {
      label: t('compConsistency'),
      description: t('compConsistencyHelp'),
      icon: Flame,
    },
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <HelpCircle className="size-5 text-accent shrink-0" />
          <span>{title}</span>
        </div>
      }
      description={subtitle ?? 'بررسی نحوه محاسبه، مؤلفه‌ها و فرمول وزن‌دار امتیاز بهره‌وری شما'}
      size="lg"
      footer={
        <Button variant="outline" onClick={onClose}>
          {t('cClose')}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 py-1">
        {/* Main Score Hero Card */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-border bg-muted/30 p-5">
          <div className="flex items-center gap-4">
            <div className="flex size-20 shrink-0 flex-col items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
              <span className={cn('text-3xl font-black tabular-nums', ratingColor(rating))}>
                {noData ? '—' : roundedScore}
              </span>
              <span className="text-[10px] text-muted-foreground">از ۱۰۰</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-foreground">سطح عملکرد:</span>
                <Badge
                  className={cn(
                    'text-xs font-semibold px-2.5 py-0.5',
                    rating === 'Excellent' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
                    rating === 'Very Good' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
                    rating === 'Good' && 'border-sky-500/30 bg-sky-500/10 text-sky-400',
                    rating === 'Fair' && 'border-amber-500/30 bg-amber-500/10 text-amber-500',
                    rating === 'Needs Improvement' && 'border-rose-500/30 bg-rose-500/10 text-rose-400',
                    rating === 'No Data' && 'text-muted-foreground',
                  )}
                >
                  {ratingLabel(rating)}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {rating === 'Needs Improvement'
                  ? 'رتبه «نیازمند بهبود» زمانی تعلق می‌گیرد که امتیاز کمتر از ۶۰ باشد. این رتبه نشان می‌دهد تسک‌های باز، عدم رعایت سررسید یا فقدان جلسات تمرکز امتیاز را کاهش داده‌اند.'
                  : rating === 'Fair'
                    ? 'عملکرد متوسط؛ اهداف روزانه تا حدی پیش رفته‌اند اما ظرفیت برای ارتقای ریتم کار عمیق وجود دارد.'
                    : rating === 'Good'
                      ? 'روز پربار با خروجی مناسب در جهت اهداف تعیین‌شده.'
                      : rating === 'Very Good'
                        ? 'عملکرد بسیار خوب و همسو با برنامه‌ریزی‌های کلیدی.'
                        : rating === 'Excellent'
                          ? 'عملکرد درخشان و حداکثری در تمام شاخص‌ها!'
                          : 'هنوز داده کافی برای ارزیابی این دوره ثبت نشده است.'}
              </p>
            </div>
          </div>
        </div>

        {/* 6 Core Components Breakdown */}
        <div>
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            مؤلفه‌های تشکیل‌دهنده امتیاز (وزن‌دهی اختصاصی)
          </h4>
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {components.map((comp: ScoreComponent) => {
              const meta = componentMeta[comp.key] ?? {
                label: comp.label,
                description: '',
                icon: CheckCircle2,
              }
              const Icon = meta.icon
              const hasValue = comp.value !== null
              const compScore = hasValue ? Math.round(comp.value!) : 0

              return (
                <div key={comp.key} className="flex flex-col gap-2 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-lg bg-muted flex items-center justify-center text-accent shrink-0">
                        <Icon className="size-3.5" />
                      </div>
                      <div>
                        <span className="text-sm font-semibold">{meta.label}</span>
                        <span className="ms-2 text-[11px] text-muted-foreground font-mono">
                          (وزن: {comp.effectiveWeight}٪)
                        </span>
                      </div>
                    </div>
                    <div className="text-end">
                      {hasValue ? (
                        <span className="font-mono text-sm font-bold text-foreground">
                          {compScore}٪
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">فاقد داده</span>
                      )}
                    </div>
                  </div>

                  <ProgressBar
                    value={hasValue ? compScore : 0}
                    barClassName={
                      !hasValue
                        ? 'bg-muted-foreground'
                        : compScore >= 80
                          ? 'bg-emerald-500'
                          : compScore >= 50
                            ? 'bg-accent'
                            : 'bg-amber-500'
                    }
                    className="h-1.5"
                  />

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{comp.explanation}</span>
                    <span className="text-[10px] opacity-75">{meta.description}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Rating Reference Table */}
        <div className="rounded-xl border border-border bg-muted/20 p-3.5 text-xs">
          <div className="font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <AlertCircle className="size-4 text-accent" />
            <span>آستانه رتبه‌بندی امتیازات:</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-[11px]">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2">
              <div className="font-bold text-emerald-400">عالی (۹۰+)</div>
              <div className="text-muted-foreground mt-0.5">Excellent</div>
            </div>
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2">
              <div className="font-bold text-emerald-400">خیلی خوب (۸۰–۸۹)</div>
              <div className="text-muted-foreground mt-0.5">Very Good</div>
            </div>
            <div className="rounded-lg bg-sky-500/10 border border-sky-500/20 p-2">
              <div className="font-bold text-sky-400">خوب (۷۰–۷۹)</div>
              <div className="text-muted-foreground mt-0.5">Good</div>
            </div>
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2">
              <div className="font-bold text-amber-400">متوسط (۶۰–۶۹)</div>
              <div className="text-muted-foreground mt-0.5">Fair</div>
            </div>
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2 col-span-2 sm:col-span-1">
              <div className="font-bold text-rose-400">نیازمند بهبود (زیر ۶۰)</div>
              <div className="text-muted-foreground mt-0.5">Needs Improvement</div>
            </div>
          </div>
        </div>

        {/* Quick Tips on Improving Score */}
        <div className="flex items-start gap-3 rounded-xl border border-accent/20 bg-accent/5 p-3.5 text-xs text-foreground">
          <Lightbulb className="size-4 text-accent shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold">چگونه این امتیاز را افزایش دهیم؟</span>
            <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
              <li>تسک‌های با اولویت بالا (فوری/ضروری) را ابتدا به پایان برسانید.</li>
              <li>از صفحه تایمر تمرکز (Focus) برای ثبت کار عمیق استفاده کنید.</li>
              <li>کارهای دارای موعد را قبل از اتمام روز مشخص‌شده علامت اتمام بزنید.</li>
            </ul>
          </div>
        </div>
      </div>
    </Modal>
  )
}
