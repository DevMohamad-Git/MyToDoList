import { useLiveQuery } from 'dexie-react-hooks'
import { Calendar, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button, LoadingState, PageHeader } from '@/components/ui'
import { reviewRepo } from '@/storage/reviewRepo'
import { useSnapshot } from '@/hooks/useSnapshot'
import { useSettings, useWorkspaceId } from '@/stores/workspace'
import { useT } from '@/i18n'
import { cn } from '@/utils/cn'
import { addDays, formatDayLabel, fromDayKey, toDayKey } from '@/utils/date'
import { startOfWeek as startOfWeekFns } from 'date-fns'
import {
  DailyReviewPanel,
  ReviewHistory,
  WeeklyReviewPanel,
} from '@/components/reviews'

/**
 * Reviews: a comprehensive daily & weekly reflection engine.
 */
export function ReviewsPage() {
  const t = useT()
  const workspaceId = useWorkspaceId()
  const snapshot = useSnapshot()
  const settings = useSettings()

  const [tab, setTab] = useState<'daily' | 'weekly'>('daily')
  const [day, setDay] = useState(() => toDayKey(new Date()))

  const currentWeekStart = useMemo(
    () => toDayKey(startOfWeekFns(new Date(), { weekStartsOn: settings.planning.weekStartsOn })),
    [settings.planning.weekStartsOn],
  )

  const [weekStartDay, setWeekStartDay] = useState(currentWeekStart)

  const allDaily = useLiveQuery(() => reviewRepo.allDaily(workspaceId), [workspaceId]) ?? []
  const allWeekly = useLiveQuery(() => reviewRepo.allWeekly(workspaceId), [workspaceId]) ?? []

  const existingDaily = useMemo(
    () => allDaily.find((r) => r.day === day),
    [allDaily, day],
  )

  const existingWeekly = useMemo(
    () => allWeekly.find((r) => r.weekStart === weekStartDay),
    [allWeekly, weekStartDay],
  )

  const todayStr = toDayKey(new Date())
  const isPast = tab === 'daily' ? day !== todayStr : weekStartDay !== currentWeekStart

  const handleJumpToToday = () => {
    if (tab === 'daily') {
      setDay(todayStr)
    } else {
      setWeekStartDay(currentWeekStart)
    }
  }

  // Global keyboard shortcuts: Alt+Left / Alt+Right for fast navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        if (tab === 'daily') {
          setDay((prev) => toDayKey(addDays(fromDayKey(prev), -1)))
        } else {
          setWeekStartDay((prev) => toDayKey(addDays(fromDayKey(prev), -7)))
        }
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        const nowDay = toDayKey(new Date())
        if (tab === 'daily') {
          setDay((prev) => (prev < nowDay ? toDayKey(addDays(fromDayKey(prev), 1)) : prev))
        } else {
          setWeekStartDay((prev) => (prev < currentWeekStart ? toDayKey(addDays(fromDayKey(prev), 7)) : prev))
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tab, currentWeekStart])

  return (
    <>
      <PageHeader
        title={t('reviewsTitle')}
        description={t('reviewsDesc')}
        actions={
          <div className="flex items-center gap-2">
            {isPast && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleJumpToToday}
                className="text-xs font-bold shadow-sm"
              >
                <RotateCcw className="size-3 me-1.5 rtl:rotate-180" />
                {tab === 'daily' ? 'بازگشت به امروز' : 'هفته جاری'}
              </Button>
            )}

            <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
              <button
                type="button"
                aria-pressed={tab === 'daily'}
                onClick={() => setTab('daily')}
                className={cn(
                  'rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors',
                  tab === 'daily'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t('reviewsTabDaily')}
              </button>
              <button
                type="button"
                aria-pressed={tab === 'weekly'}
                onClick={() => setTab('weekly')}
                className={cn(
                  'rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors',
                  tab === 'weekly'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t('reviewsTabWeekly')}
              </button>
            </div>
          </div>
        }
      />

      {/* Prominent Past Navigation Indicator Banner */}
      {isPast && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-xs sm:text-sm text-foreground shadow-sm">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-accent shrink-0" />
            <span className="font-semibold text-accent">
              {tab === 'daily'
                ? `در حال مشاهده و ارزیابی روز گذشته: ${formatDayLabel(day)}`
                : `در حال مشاهده و ارزیابی هفته گذشته: ${formatDayLabel(weekStartDay)}`}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleJumpToToday}
            className="h-7 text-xs font-bold border-accent/40 hover:bg-accent hover:text-accent-foreground"
          >
            <RotateCcw className="size-3 me-1 rtl:rotate-180" />
            {tab === 'daily' ? 'پرش به مرور امروز' : 'پرش به هفته جاری'}
          </Button>
        </div>
      )}

      {!snapshot ? (
        <LoadingState label={t('cLoading')} />
      ) : (
        <div className="flex flex-col gap-6">
          {tab === 'daily' ? (
            <DailyReviewPanel
              day={day}
              setDay={setDay}
              existing={existingDaily}
              snapshot={snapshot}
            />
          ) : (
            <WeeklyReviewPanel
              weekStartDay={weekStartDay}
              setWeekStartDay={setWeekStartDay}
              currentWeekStart={currentWeekStart}
              existing={existingWeekly}
              allWeekly={allWeekly}
              snapshot={snapshot}
            />
          )}

          <ReviewHistory
            daily={allDaily}
            weekly={allWeekly}
            onSelectDaily={(d) => {
              setDay(d)
              setTab('daily')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            onSelectWeekly={(w) => {
              setWeekStartDay(w)
              setTab('weekly')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        </div>
      )}
    </>
  )
}
