import {
  AlertTriangle,
  BarChart3,
  CalendarRange,
  Clock,
  Download,
  Filter,
  Flame,
  Lightbulb,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  JalaliDatePicker,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  ScoreRing,
  StatTile,
  toast,
} from '@/components/ui'
import {
  buildAnalyticsIndex,
  completionByWeekday,
  computeRangeStats,
  estimationInsights,
  focusByHour,
  scoreTrend,
  tasksByTag,
  timeByProject,
} from '@/services/analytics'
import { useSnapshot } from '@/hooks/useSnapshot'
import { ratingLabel, useT } from '@/i18n'
import { subDays } from 'date-fns'
import type { DayKey, ID } from '@/types'
import { cn } from '@/utils/cn'
import { formatDayLabel, formatDuration, fromDayKey, toDayKey } from '@/utils/date'

/**
 * Period delta indicator: shows change compared to the previous stretch of same length.
 */
function DeltaBadge({
  delta,
  suffix = '%',
  label,
  invertTone = false,
}: {
  delta: number
  suffix?: string
  label: string
  invertTone?: boolean
}) {
  if (Math.abs(delta) < 0.5) return null
  const isPositive = delta > 0
  const isGood = invertTone ? !isPositive : isPositive
  const formatted = `${isPositive ? '+' : ''}${Math.round(delta)}${suffix}`

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums border',
        isGood
          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
          : 'border-rose-500/25 bg-rose-500/10 text-rose-400',
      )}
      title={`${label}: ${formatted}`}
    >
      {isPositive ? '↑' : '↓'} {formatted}
    </span>
  )
}

/**
 * Enhanced Analytics over the workspace snapshot.
 * Supports multi-dimensional filtering, period-over-period comparisons,
 * smart prescriptive insights, and report export.
 */
export function AnalyticsPage() {
  const t = useT()
  const snapshot = useSnapshot()
  const [range, setRange] = useState<'7' | '14' | '30' | '90'>('30')
  const [anchor, setAnchor] = useState(() => toDayKey(new Date()))

  // Multi-dimensional filters
  const [selectedProjectId, setSelectedProjectId] = useState<ID | 'all'>('all')
  const [selectedTag, setSelectedTag] = useState<string | 'all'>('all')

  // Date windows: Current period
  const dayKeys = useMemo<DayKey[]>(() => {
    const end = fromDayKey(anchor)
    return Array.from({ length: Number(range) }, (_, i) =>
      toDayKey(subDays(end, Number(range) - 1 - i)),
    )
  }, [anchor, range])

  // Date windows: Previous period of same duration for period-over-period comparisons
  const prevDayKeys = useMemo<DayKey[]>(() => {
    const prevEnd = subDays(fromDayKey(dayKeys[0]), 1)
    return Array.from({ length: Number(range) }, (_, i) =>
      toDayKey(subDays(prevEnd, Number(range) - 1 - i)),
    )
  }, [dayKeys, range])

  // Available filter options derived from snapshot
  const availableProjects = useMemo(() => {
    return snapshot ? snapshot.projects : []
  }, [snapshot])

  const availableTags = useMemo(() => {
    if (!snapshot) return []
    const tagSet = new Set<string>()
    for (const task of snapshot.tasks) {
      for (const tag of task.tags) tagSet.add(tag)
    }
    return Array.from(tagSet).sort()
  }, [snapshot])

  // Scoped snapshot according to selected project & tag filters
  const filteredSnapshot = useMemo(() => {
    if (!snapshot) return null
    if (selectedProjectId === 'all' && selectedTag === 'all') return snapshot

    const filteredTasks = snapshot.tasks.filter((t) => {
      if (selectedProjectId !== 'all' && t.projectId !== selectedProjectId) return false
      if (selectedTag !== 'all' && !t.tags.includes(selectedTag)) return false
      return true
    })

    const filteredTimeEntries = snapshot.timeEntries.filter((e) => {
      if (selectedProjectId !== 'all' && e.projectId !== selectedProjectId) return false
      return true
    })

    const filteredFocusSessions = snapshot.focusSessions.filter((s) => {
      if (selectedProjectId !== 'all') {
        const task = s.taskId ? snapshot.tasks.find((t) => t.id === s.taskId) : null
        if (task && task.projectId !== selectedProjectId) return false
      }
      return true
    })

    return {
      ...snapshot,
      tasks: filteredTasks,
      timeEntries: filteredTimeEntries,
      focusSessions: filteredFocusSessions,
    }
  }, [snapshot, selectedProjectId, selectedTag])

  // Pre-index the snapshot in a single O(T + E + S) pass for sub-millisecond range computations
  const analyticsIndex = useMemo(() => {
    return filteredSnapshot ? buildAnalyticsIndex(filteredSnapshot) : undefined
  }, [filteredSnapshot])

  // Current and previous range statistics using the pre-computed index
  const stats = useMemo(
    () => (filteredSnapshot ? computeRangeStats(filteredSnapshot, dayKeys, new Date(), analyticsIndex) : null),
    [filteredSnapshot, dayKeys, analyticsIndex],
  )

  const prevStats = useMemo(
    () => (filteredSnapshot ? computeRangeStats(filteredSnapshot, prevDayKeys, new Date(), analyticsIndex) : null),
    [filteredSnapshot, prevDayKeys, analyticsIndex],
  )

  // Period deltas
  const deltas = useMemo(() => {
    if (!stats || !prevStats) return null
    return {
      score: stats.score - prevStats.score,
      completionRate: stats.completionRate - prevStats.completionRate,
      focusMinutes: stats.focusMinutes - prevStats.focusMinutes,
      deadlineDiscipline: stats.deadlineDiscipline - prevStats.deadlineDiscipline,
    }
  }, [stats, prevStats])

  const projectSlices = useMemo(
    () => (filteredSnapshot ? timeByProject(filteredSnapshot, dayKeys[0], dayKeys[dayKeys.length - 1]) : []),
    [filteredSnapshot, dayKeys],
  )
  const hourBuckets = useMemo(
    () => (filteredSnapshot ? focusByHour(filteredSnapshot, dayKeys[0], dayKeys[dayKeys.length - 1]) : []),
    [filteredSnapshot, dayKeys],
  )
  const weekdayBuckets = useMemo(() => (filteredSnapshot ? completionByWeekday(filteredSnapshot) : []), [filteredSnapshot])
  const weekdayLabelMap: Record<string, string> = useMemo(
    () => ({
      Sun: t('analyticsWeekdaySun'),
      Mon: t('analyticsWeekdayMon'),
      Tue: t('analyticsWeekdayTue'),
      Wed: t('analyticsWeekdayWed'),
      Thu: t('analyticsWeekdayThu'),
      Fri: t('analyticsWeekdayFri'),
      Sat: t('analyticsWeekdaySat'),
    }),
    [t],
  )
  const localizedWeekdayBuckets = useMemo(() => {
    return weekdayBuckets.map((b) => ({
      ...b,
      label: weekdayLabelMap[b.label] ?? b.label,
    }))
  }, [weekdayBuckets, weekdayLabelMap])

  const tagSlices = useMemo(() => (filteredSnapshot ? tasksByTag(filteredSnapshot).slice(0, 10) : []), [filteredSnapshot])
  const insights = useMemo(() => (filteredSnapshot ? estimationInsights(filteredSnapshot) : []), [filteredSnapshot])
  const trend = useMemo(() => (stats ? scoreTrend(stats.days) : null), [stats])

  // Smart prescriptive recommendations
  const smartInsights = useMemo(() => {
    if (!stats) return []
    const list: { id: string; icon: typeof Sparkles; text: string; tone: 'accent' | 'positive' | 'warning' }[] = []

    // 1. Peak focus hour
    const activeHours = [...hourBuckets].sort((a, b) => b.minutes - a.minutes)
    if (activeHours.length > 0 && activeHours[0].minutes > 0) {
      list.push({
        id: 'peak-hour',
        icon: Zap,
        text: t('analyticsInsightPeakHour', { time: activeHours[0].label }),
        tone: 'accent',
      })
    }

    // 2. Best weekday
    const activeDays = [...weekdayBuckets].sort((a, b) => b.completed - a.completed)
    if (activeDays.length > 0 && activeDays[0].completed > 0) {
      const dayName = weekdayLabelMap[activeDays[0].label] ?? activeDays[0].label
      list.push({
        id: 'best-day',
        icon: Target,
        text: t('analyticsInsightBestDay', { day: dayName }),
        tone: 'positive',
      })
    }

    // 3. Worst estimation bias
    if (insights.length > 0) {
      const topBias = insights[0]
      if (topBias.biasPercent > 15) {
        list.push({
          id: 'underestimate',
          icon: AlertTriangle,
          text: t('analyticsInsightUnderestimate', {
            project: topBias.projectName,
            percent: topBias.biasPercent,
          }),
          tone: 'warning',
        })
      } else if (topBias.biasPercent < -15) {
        list.push({
          id: 'overestimate',
          icon: Clock,
          text: t('analyticsInsightOverestimate', {
            project: topBias.projectName,
            percent: Math.abs(topBias.biasPercent),
          }),
          tone: 'positive',
        })
      }
    }

    // 4. Consistency & Pace
    if (stats.consistency >= 70) {
      list.push({
        id: 'consistency',
        icon: Flame,
        text: t('analyticsInsightConsistent', { percent: stats.consistency }),
        tone: 'positive',
      })
    } else if (stats.consistency < 30 && stats.plannedTasks > 0) {
      list.push({
        id: 'low-activity',
        icon: Lightbulb,
        text: t('analyticsInsightLowActivity'),
        tone: 'warning',
      })
    }

    return list
  }, [stats, hourBuckets, weekdayBuckets, insights, t])

  // Export report as clean JSON
  function handleExport() {
    if (!stats || !filteredSnapshot) return
    const reportData = {
      title: 'FlowOS Analytics Report',
      exportedAt: new Date().toISOString(),
      rangeDays: Number(range),
      anchorDate: anchor,
      startDate: stats.startDay,
      endDate: stats.endDay,
      filters: {
        projectId: selectedProjectId,
        tag: selectedTag,
      },
      summary: {
        score: stats.score,
        rating: stats.rating,
        plannedTasks: stats.plannedTasks,
        completedTasks: stats.completedTasks,
        completionRate: `${stats.completionRate}%`,
        focusMinutes: stats.focusMinutes,
        focusDurationFormatted: formatDuration(stats.focusMinutes),
        focusSessions: stats.focusSessions,
        consistencyPercent: `${stats.consistency}%`,
        deadlineDisciplinePercent: `${stats.deadlineDiscipline}%`,
        estimateAccuracyRatio: stats.estimateAccuracy,
      },
      periodComparison: deltas
        ? {
            deltaScore: deltas.score,
            deltaCompletionRate: deltas.completionRate,
            deltaFocusMinutes: deltas.focusMinutes,
            deltaDeadlineDiscipline: deltas.deadlineDiscipline,
          }
        : null,
      timeByProject: projectSlices,
      weekdayActivity: weekdayBuckets,
      estimationInsights: insights,
    }

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `analytics-report-${stats.startDay}-to-${stats.endDay}.json`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(t('analyticsExportToast'))
  }

  if (!snapshot || !stats) {
    return <EmptyState title={t('analyticsLoadingTitle')} description={t('analyticsLoadingDesc')} />
  }

  const chartDays = stats.days
  const hasAnyData = chartDays.some((d) => !d.noData)
  const isHeavyWorkload = stats.focusMinutes / Math.max(1, Number(range)) > 300 // > 5 hours average daily focus

  return (
    <>
      <PageHeader
        title={t('analyticsTitle')}
        description={t('analyticsDesc')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <JalaliDatePicker
              value={anchor}
              max={toDayKey(new Date())}
              onChange={(v) => v && setAnchor(v)}
              className="w-36"
            />
            <SegmentedControl
              value={range}
              options={[
                { value: '7', label: t('analyticsRange7d') },
                { value: '14', label: t('analyticsRange14d') },
                { value: '30', label: t('analyticsRange30d') },
                { value: '90', label: t('analyticsRange90d') },
              ]}
              onChange={setRange}
            />
            <Button variant="outline" size="sm" onClick={handleExport} title={t('analyticsExportReport')}>
              <Download className="size-4" />
              <span className="hidden sm:inline">{t('analyticsExportReport')}</span>
            </Button>
          </div>
        }
      />

      {/* ------------------------------------------- multi-dimensional filter bar -- */}
      <Card className="mb-4 p-2.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground me-1 font-medium">
            <Filter className="size-3.5 text-accent" />
            <span>{t('analyticsProjectFilterAll')}:</span>
          </div>

          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value as ID | 'all')}
            className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground outline-none focus:border-accent cursor-pointer shadow-sm"
          >
            <option value="all">{t('analyticsProjectFilterAll')}</option>
            {availableProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {availableTags.length > 0 ? (
            <>
              <span className="text-border">|</span>
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground outline-none focus:border-accent cursor-pointer shadow-sm"
              >
                <option value="all">{t('analyticsTagFilterAll')}</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    #{tag}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          {/* Workload / Pace Badge */}
          <div className="ms-auto flex items-center gap-2">
            <Badge
              className={cn(
                'text-[11px] font-medium',
                isHeavyWorkload
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                  : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
              )}
            >
              {isHeavyWorkload ? (
                <>
                  <AlertTriangle className="size-3" />
                  {t('analyticsPaceHeavy')}
                </>
              ) : (
                <>
                  <Flame className="size-3" />
                  {t('analyticsPaceHealthy')}
                </>
              )}
            </Badge>
          </div>
        </div>
      </Card>

      {!hasAnyData ? (
        <EmptyState
          icon={<BarChart3 className="size-8" />}
          title={t('analyticsNoDataTitle')}
          description={t('analyticsNoDataDesc')}
        />
      ) : (
        <>
          {/* ----------------------------------------- score ring & KPI tiles -- */}
          <div className="mb-4 grid gap-4 lg:grid-cols-[auto_1fr]">
            <Card className="flex items-center gap-5 p-5">
              <ScoreRing
                score={stats.score}
                rating={stats.rating}
                size={112}
                label={t('analyticsAvgLabel', { range })}
              />
              <div className="min-w-0 space-y-1">
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {formatDayLabel(stats.startDay)} → {formatDayLabel(stats.endDay)}
                </div>
                <div className="text-lg font-semibold flex items-center gap-2">
                  <span>{ratingLabel(stats.rating)}</span>
                  {deltas ? (
                    <DeltaBadge
                      delta={deltas.score}
                      suffix=" pts"
                      label={t('analyticsVsPrevPeriod', { range })}
                    />
                  ) : null}
                </div>
                {trend ? (
                  <Badge
                    className={
                      trend.direction === 'up'
                        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                        : trend.direction === 'down'
                          ? 'border-rose-500/25 bg-rose-500/10 text-rose-400'
                          : ''
                    }
                  >
                    {trend.direction === 'up' ? (
                      <TrendingUp className="size-3" />
                    ) : (
                      <TrendingDown className="size-3" />
                    )}
                    {trend.direction === 'up'
                      ? t('analyticsTrendImproving')
                      : trend.direction === 'down'
                        ? t('analyticsTrendDeclining')
                        : t('analyticsTrendFlat')}
                  </Badge>
                ) : null}
                <div className="pt-1 text-xs text-muted-foreground">
                  {t('analyticsBestDay', {
                    day: stats.bestDay ? `${stats.bestDay.label} (${Math.round(stats.bestDay.score)})` : '—',
                  })}
                  <br />
                  {t('analyticsWeakestDay', {
                    day: stats.weakestDay ? `${stats.weakestDay.label} (${Math.round(stats.weakestDay.score)})` : '—',
                  })}
                </div>
              </div>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label={t('analyticsCompletionRate')}
                value={`${stats.completionRate}%`}
                hint={
                  <div className="flex items-center justify-between gap-1">
                    <span>
                      {t('analyticsCompletionHint', {
                        completed: stats.completedTasks,
                        planned: stats.plannedTasks,
                      })}
                    </span>
                    {deltas ? (
                      <DeltaBadge delta={deltas.completionRate} label={t('analyticsVsPrevPeriod', { range })} />
                    ) : null}
                  </div>
                }
                tone="positive"
                icon={<Target className="size-4" />}
              />
              <StatTile
                label={t('analyticsDeadlineDiscipline')}
                value={`${stats.deadlineDiscipline}%`}
                hint={
                  <div className="flex items-center justify-between gap-1">
                    <span>
                      {t('analyticsDeadlineHint', {
                        met: stats.metDeadlines,
                        missed: stats.missedDeadlines,
                      })}
                    </span>
                    {deltas ? (
                      <DeltaBadge delta={deltas.deadlineDiscipline} label={t('analyticsVsPrevPeriod', { range })} />
                    ) : null}
                  </div>
                }
                tone={stats.deadlineDiscipline >= 80 ? 'positive' : stats.missedDeadlines > 0 ? 'warning' : 'default'}
              />
              <StatTile
                label={t('analyticsFocusTime')}
                value={formatDuration(stats.focusMinutes)}
                hint={
                  <div className="flex items-center justify-between gap-1">
                    <span>
                      {t('analyticsFocusHint', {
                        sessions: stats.focusSessions,
                        consistency: stats.consistency,
                      })}
                    </span>
                    {deltas ? (
                      <DeltaBadge
                        delta={Math.round((deltas.focusMinutes / 60) * 10) / 10}
                        suffix="h"
                        label={t('analyticsVsPrevPeriod', { range })}
                      />
                    ) : null}
                  </div>
                }
                tone="accent"
                icon={<Flame className="size-4" />}
              />
              <StatTile
                label={t('analyticsEstimateAccuracy')}
                value={stats.estimateAccuracy != null ? `${Math.round(stats.estimateAccuracy * 100)}%` : '—'}
                hint={
                  stats.estimateAccuracy == null
                    ? t('analyticsNoComparable')
                    : stats.estimateAccuracy > 1
                      ? t('analyticsTakesLonger')
                      : t('analyticsFaster')
                }
                icon={<Clock className="size-4" />}
              />
            </div>
          </div>

          {/* --------------------------------------- smart prescriptive insights -- */}
          {smartInsights.length > 0 ? (
            <Card className="mb-4 border-accent/30 bg-accent/5">
              <CardHeader
                title={t('analyticsSmartInsightsTitle')}
                description={t('analyticsDesc')}
                icon={<Sparkles className="size-4 text-accent" />}
              />
              <CardBody className="grid gap-2 sm:grid-cols-2">
                {smartInsights.map((insight) => {
                  const Icon = insight.icon
                  return (
                    <div
                      key={insight.id}
                      className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3 shadow-sm"
                    >
                      <Icon
                        className={cn(
                          'size-4 mt-0.5 shrink-0',
                          insight.tone === 'accent'
                            ? 'text-accent'
                            : insight.tone === 'positive'
                              ? 'text-emerald-400'
                              : 'text-amber-400',
                        )}
                      />
                      <p className="text-xs text-foreground leading-relaxed font-medium">
                        {insight.text}
                      </p>
                    </div>
                  )
                })}
              </CardBody>
            </Card>
          ) : null}

          {/* ---------------------------------------------------- daily score chart -- */}
          <Card className="mb-4">
            <CardHeader
              title={t('analyticsDailyScoreTitle')}
              description={t('analyticsDailyScoreDesc', { range })}
              icon={<CalendarRange className="size-4" />}
            />
            <CardBody className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartDays} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" stroke="var(--color-muted-foreground)" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-popover)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          {/* ------------------------------------------------ distribution charts -- */}
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title={t('analyticsTrackedTimeTitle')}
                description={t('analyticsTrackedTimeDesc')}
                icon={<Clock className="size-4" />}
              />
              {projectSlices.length === 0 ? (
                <CardBody>
                  <p className="text-sm text-muted-foreground">{t('analyticsNoTrackedTime')}</p>
                </CardBody>
              ) : (
                <CardBody className="flex flex-col items-center gap-4 sm:flex-row">
                  <div className="h-48 w-48 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={projectSlices}
                          dataKey="minutes"
                          nameKey="name"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                        >
                          {projectSlices.map((slice) => (
                            <Cell key={slice.id} fill={slice.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number | string) => formatDuration(Number(value))}
                          contentStyle={{
                            background: 'var(--color-popover)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    {projectSlices.slice(0, 6).map((slice) => (
                      <div key={slice.id} className="flex items-center gap-2 text-xs">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                        <span className="min-w-0 flex-1 truncate">{slice.name}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {formatDuration(slice.minutes)} · {slice.percent}%
                        </span>
                      </div>
                    ))}
                  </div>
                </CardBody>
              )}
            </Card>

            <Card>
              <CardHeader
                title={t('analyticsFocusByHourTitle')}
                description={t('analyticsFocusByHourDesc')}
                icon={<Flame className="size-4" />}
              />
              <CardBody className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourBuckets} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} stroke="var(--color-muted-foreground)" />
                    <YAxis tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" />
                    <Tooltip
                      formatter={(value: number | string) => formatDuration(Number(value))}
                      contentStyle={{
                        background: 'var(--color-popover)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="minutes" fill="var(--color-accent)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title={t('analyticsStrongestWeekdaysTitle')}
                description={t('analyticsStrongestWeekdaysDesc')}
              />
              <CardBody className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={localizedWeekdayBuckets} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <YAxis tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--color-popover)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="completed" name="tasks" fill="var(--color-accent)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title={t('analyticsEstimationInsightsTitle')}
                description={t('analyticsEstimationInsightsDesc')}
                icon={<AlertTriangle className="size-4" />}
              />
              {insights.length === 0 ? (
                <CardBody>
                  <p className="text-sm text-muted-foreground">
                    {t('analyticsEstimationEmpty')}
                  </p>
                </CardBody>
              ) : (
                <CardBody className="space-y-3">
                  {insights.slice(0, 6).map((insight) => (
                    <div key={insight.projectId}>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="truncate font-medium">{insight.projectName}</span>
                        <span
                          className={
                            insight.biasPercent > 10
                              ? 'shrink-0 tabular-nums text-rose-400'
                              : insight.biasPercent < -10
                                ? 'shrink-0 tabular-nums text-sky-400'
                                : 'shrink-0 tabular-nums text-muted-foreground'
                          }
                        >
                          {insight.biasPercent > 0 ? '+' : ''}
                          {insight.biasPercent}% ({insight.samples} tasks)
                        </span>
                      </div>
                      <ProgressBar
                        className="mt-1"
                        height="sm"
                        value={Math.min(100, Math.abs(insight.biasPercent))}
                        barClassName={
                          insight.biasPercent > 0
                            ? 'bg-rose-500'
                            : insight.biasPercent < 0
                              ? 'bg-sky-500'
                              : undefined
                        }
                      />
                    </div>
                  ))}
                </CardBody>
              )}
            </Card>
          </div>

          {/* ------------------------------------------------------------- top tags -- */}
          {tagSlices.length > 0 ? (
            <Card>
              <CardHeader title={t('analyticsTopTagsTitle')} description={t('analyticsTopTagsDesc')} />
              <div className="divide-y divide-border">
                {tagSlices.map((slice) => (
                  <div key={slice.tag} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">#{slice.tag}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {t('analyticsTagDoneRatio', { completed: slice.completed, count: slice.count })}
                    </span>
                    <div className="w-28 shrink-0">
                      <ProgressBar
                        height="sm"
                        value={slice.count ? (slice.completed / slice.count) * 100 : 0}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      )}
    </>
  )
}
