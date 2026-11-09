import { ArrowLeft, ArrowRight, Check, Copy, HelpCircle } from 'lucide-react'
import { Badge, Button, Card, ScoreLabel } from '@/components/ui'
import type { RangeStats } from '@/services/analytics'
import { useT } from '@/i18n'
import type { DayKey } from '@/types'
import { formatDayLabel } from '@/utils/date'

interface WeekNavProps {
  weekStartDay: DayKey
  setWeekStartDay: (d: DayKey) => void
  currentWeekStart: DayKey
  weekEndDay: DayKey
  saveStatus: 'saved' | 'saving' | 'unsaved' | 'idle'
  weekStats?: RangeStats
  onExportMarkdown: () => void
  shiftWeek: (delta: number) => void
  onScoreClick?: () => void
}

export function WeekNav({
  weekStartDay,
  setWeekStartDay,
  currentWeekStart,
  weekEndDay,
  saveStatus,
  weekStats,
  onExportMarkdown,
  shiftWeek,
  onScoreClick,
}: WeekNavProps) {
  const t = useT()

  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('reviewsWeekNavPrev')}
            onClick={() => shiftWeek(-7)}
          >
            <ArrowLeft className="size-4 rtl:rotate-180" />
          </Button>

          <span className="text-sm font-semibold px-2">
            {t('reviewsWeekRange', {
              start: formatDayLabel(weekStartDay),
              end: formatDayLabel(weekEndDay),
            })}
          </span>

          <Button
            variant="outline"
            size="icon"
            aria-label={t('reviewsWeekNavNext')}
            disabled={weekStartDay >= currentWeekStart}
            onClick={() => shiftWeek(7)}
          >
            <ArrowRight className="size-4 rtl:rotate-180" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeekStartDay(currentWeekStart)}
          >
            {t('reviewsWeekNavCurrent')}
          </Button>

          {saveStatus === 'saved' ? (
            <Badge className="text-emerald-500 border-emerald-500/30">
              <Check className="size-3 me-1" />
              {t('reviewsSavedBadge')}
            </Badge>
          ) : saveStatus === 'saving' ? (
            <Badge className="text-sky-500 border-sky-500/30">
              {t('reviewsSaving')}
            </Badge>
          ) : saveStatus === 'unsaved' ? (
            <Badge className="text-amber-500 border-amber-500/30">
              {t('reviewsUnsavedChanges')}
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {weekStats && !weekStats.rating.includes('No') ? (
            <button
              type="button"
              onClick={onScoreClick}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 text-xs hover:border-accent hover:bg-accent/5 hover:text-foreground transition-all cursor-pointer shadow-sm group"
              title="کلیک برای مشاهده جزئیات، فرمول و مؤلفه‌های رتبه عملکرد هفته"
            >
              <ScoreLabel score={weekStats.score} rating={weekStats.rating} />
              <span className="text-[11px] text-muted-foreground group-hover:text-accent border-s border-border ps-2 hidden sm:inline">
                تحلیل رتبه
              </span>
              <HelpCircle className="size-3.5 text-muted-foreground group-hover:text-accent transition-colors" />
            </button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onExportMarkdown}>
            <Copy className="size-3.5 me-1" />
            {t('reviewsExportMarkdown')}
          </Button>
        </div>
      </div>
    </Card>
  )
}
