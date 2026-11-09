import { Star, TrendingUp } from 'lucide-react'
import { Badge, Card, CardBody, CardHeader } from '@/components/ui'
import type { DayPoint } from '@/services/analytics'
import { useT } from '@/i18n'
import type { DayKey } from '@/types'
import { cn } from '@/utils/cn'
import { formatDayLabel, formatDuration, toDayKey } from '@/utils/date'

interface WeeklyTrendChartProps {
  days: DayPoint[]
  all7DayKeys: DayKey[]
  bestDay: { day: DayKey; score: number } | null
}

export function WeeklyTrendChart({ days, all7DayKeys, bestDay }: WeeklyTrendChartProps) {
  const t = useT()
  const todayStr = toDayKey(new Date())

  // Map keyed on day string for quick lookup
  const dayPointMap = new Map(days.map((d) => [d.day, d]))

  return (
    <Card>
      <CardHeader
        title={t('reviewsWeeklyTrendTitle')}
        icon={<TrendingUp className="size-4 text-emerald-500" />}
        actions={
          bestDay && (
            <Badge className="text-amber-500 border-amber-500/30">
              <Star className="size-3 me-1 fill-amber-500" />
              {t('reviewsWeeklyBestDay')}: {formatDayLabel(bestDay.day)}
            </Badge>
          )
        }
      />
      <CardBody>
        <div className="grid grid-cols-7 gap-2 pt-4 pb-2 items-end min-h-[140px]">
          {all7DayKeys.map((dayKey) => {
            const isFuture = dayKey > todayStr
            const d = dayPointMap.get(dayKey)
            const isBest = !isFuture && bestDay?.day === dayKey
            const hasData = d && !d.noData && !isFuture

            // Pillar height logic
            const heightPct = isFuture ? 6 : !hasData ? 8 : Math.max(12, Math.round(d!.score))

            // Label fallback
            const dayLabel = d?.label ?? formatDayLabel(dayKey)

            return (
              <div key={dayKey} className="flex flex-col items-center gap-2 group">
                <span className="text-[11px] font-mono font-medium text-muted-foreground group-hover:text-foreground">
                  {isFuture ? '—' : !hasData ? '—' : `${Math.round(d!.score)}%`}
                </span>

                <div
                  className={cn(
                    'w-full rounded-t-lg h-28 flex items-end p-1 relative',
                    isFuture
                      ? 'bg-muted/15 border-t border-dashed border-border/40'
                      : 'bg-muted/40',
                  )}
                >
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={cn(
                      'w-full rounded-md transition-all duration-300 relative',
                      isFuture
                        ? 'bg-muted/30 border border-dashed border-muted-foreground/20'
                        : !hasData
                          ? 'bg-muted'
                          : isBest
                            ? 'bg-gradient-to-t from-amber-500 to-amber-400 shadow-md shadow-amber-500/20'
                            : d!.score >= 70
                              ? 'bg-emerald-500/80 hover:bg-emerald-500'
                              : 'bg-accent/80 hover:bg-accent',
                    )}
                  >
                    {isBest && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Star className="size-3 fill-amber-500 text-amber-500" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-center">
                  <div
                    className={cn(
                      'text-xs font-semibold',
                      isFuture && 'text-muted-foreground/60 font-normal',
                    )}
                  >
                    {dayLabel}
                  </div>
                  <div className="text-[10px] text-muted-foreground h-4">
                    {isFuture ? (
                      <span className="italic text-[9px] text-muted-foreground/50">آینده</span>
                    ) : d && d.focusMinutes > 0 ? (
                      formatDuration(d.focusMinutes, { compact: true })
                    ) : (
                      ''
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardBody>
    </Card>
  )
}
