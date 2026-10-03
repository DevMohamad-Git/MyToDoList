import {
  AlertTriangle,
  BarChart3,
  CalendarRange,
  Clock,
  Flame,
  Target,
  TrendingUp,
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
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  ScoreRing,
  StatTile,
} from '@/components/ui'
import {
  completionByWeekday,
  computeRangeStats,
  estimationInsights,
  focusByHour,
  scoreTrend,
  tasksByTag,
  timeByProject,
} from '@/services/analytics'
import { useSnapshot } from '@/hooks/useSnapshot'
import { subDays } from 'date-fns'
import type { DayKey } from '@/types'
import { formatDayLabel, formatDuration, fromDayKey, toDayKey } from '@/utils/date'

/**
 * Analytics over the workspace snapshot. Every chart is a pure projection of
 * `computeRangeStats` / the distribution helpers, so the numbers on this page
 * can never disagree with the dashboard or the reviews.
 */
export function AnalyticsPage() {
  const snapshot = useSnapshot()
  const [range, setRange] = useState<'7' | '14' | '30' | '90'>('30')
  const [anchor, setAnchor] = useState(() => toDayKey(new Date()))

  const dayKeys = useMemo<DayKey[]>(() => {
    const end = fromDayKey(anchor)
    return Array.from({ length: Number(range) }, (_, i) =>
      toDayKey(subDays(end, Number(range) - 1 - i)),
    )
  }, [anchor, range])

  const stats = useMemo(
    () => (snapshot ? computeRangeStats(snapshot, dayKeys) : null),
    [snapshot, dayKeys],
  )

  const projectSlices = useMemo(
    () => (snapshot ? timeByProject(snapshot, dayKeys[0], dayKeys[dayKeys.length - 1]) : []),
    [snapshot, dayKeys],
  )
  const hourBuckets = useMemo(
    () => (snapshot ? focusByHour(snapshot, dayKeys[0], dayKeys[dayKeys.length - 1]) : []),
    [snapshot, dayKeys],
  )
  const weekdayBuckets = useMemo(() => (snapshot ? completionByWeekday(snapshot) : []), [snapshot])
  const tagSlices = useMemo(() => (snapshot ? tasksByTag(snapshot).slice(0, 10) : []), [snapshot])
  const insights = useMemo(() => (snapshot ? estimationInsights(snapshot) : []), [snapshot])
  const trend = useMemo(() => (stats ? scoreTrend(stats.days) : null), [stats])

  if (!snapshot || !stats) {
    return <EmptyState title="Loading analytics…" description="Crunching your history." />
  }

  const chartDays = stats.days
  const hasAnyData = chartDays.some((d) => !d.noData)

  return (
    <>
      <PageHeader
        title="Analytics"
        description="What the numbers say about how the last stretch actually went."
        actions={
          <>
            <input
              type="date"
              value={anchor}
              max={toDayKey(new Date())}
              onChange={(e) => e.target.value && setAnchor(e.target.value)}
              className="h-8 rounded-lg border border-input bg-background px-2 text-xs focus:border-accent focus:outline-none"
            />
            <SegmentedControl
              value={range}
              options={[
                { value: '7', label: '7d' },
                { value: '14', label: '14d' },
                { value: '30', label: '30d' },
                { value: '90', label: '90d' },
              ]}
              onChange={setRange}
            />
          </>
        }
      />

      {!hasAnyData ? (
        <EmptyState
          icon={<BarChart3 className="size-8" />}
          title="No data in this window"
          description="Complete a task or run a focus session to start building the trend."
        />
      ) : (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-[auto_1fr]">
            <Card className="flex items-center gap-5 p-5">
              <ScoreRing score={stats.score} rating={stats.rating} size={112} label={`${range}-day avg`} />
              <div className="min-w-0">
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {formatDayLabel(stats.startDay)} → {formatDayLabel(stats.endDay)}
                </div>
                <div className="mt-1 text-lg font-semibold">{stats.rating}</div>
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
                    <TrendingUp className="size-3" />
                    {trend.direction === 'up' ? 'Improving' : trend.direction === 'down' ? 'Declining' : 'Flat'}{' '}
                    trend
                  </Badge>
                ) : null}
                <div className="mt-2 text-xs text-muted-foreground">
                  Best day: {stats.bestDay ? `${stats.bestDay.label} (${Math.round(stats.bestDay.score)})` : '—'}
                  <br />
                  Weakest: {stats.weakestDay ? `${stats.weakestDay.label} (${Math.round(stats.weakestDay.score)})` : '—'}
                </div>
              </div>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="Completion"
                value={`${stats.completionRate}%`}
                hint={`${stats.completedTasks} of ${stats.plannedTasks} tasks`}
                tone="positive"
                icon={<Target className="size-4" />}
              />
              <StatTile
                label="Deadline discipline"
                value={`${stats.deadlineDiscipline}%`}
                hint={`${stats.metDeadlines} met · ${stats.missedDeadlines} missed`}
                tone={stats.deadlineDiscipline >= 80 ? 'positive' : stats.missedDeadlines > 0 ? 'warning' : 'default'}
              />
              <StatTile
                label="Focus time"
                value={formatDuration(stats.focusMinutes)}
                hint={`${stats.focusSessions} session(s) · ${stats.consistency}% active days`}
                tone="accent"
                icon={<Flame className="size-4" />}
              />
              <StatTile
                label="Estimate accuracy"
                value={stats.estimateAccuracy != null ? `${Math.round(stats.estimateAccuracy * 100)}%` : '—'}
                hint={
                  stats.estimateAccuracy == null
                    ? 'No comparable work yet'
                    : stats.estimateAccuracy > 1
                      ? 'Takes longer than estimated'
                      : 'Faster than estimated'
                }
                icon={<Clock className="size-4" />}
              />
            </div>
          </div>

          <Card className="mb-4">
            <CardHeader
              title="Daily score"
              description={`Every day in the ${range}-day window, with completed vs planned tasks`}
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

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Where tracked time went"
                description="By project, across the window"
                icon={<Clock className="size-4" />}
              />
              {projectSlices.length === 0 ? (
                <CardBody>
                  <p className="text-sm text-muted-foreground">No tracked time in this window.</p>
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
                title="Focus by hour"
                description="When deep work actually happens"
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
                title="Strongest weekdays"
                description="Completions and focus by day of week"
              />
              <CardBody className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekdayBuckets} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
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
                title="Estimation insights"
                description="Where you consistently under- or over-estimate"
                icon={<AlertTriangle className="size-4" />}
              />
              {insights.length === 0 ? (
                <CardBody>
                  <p className="text-sm text-muted-foreground">
                    Complete a few estimated tasks and this will show your bias per project.
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

          {tagSlices.length > 0 ? (
            <Card>
              <CardHeader title="Top tags" description="How tagged work completes" />
              <div className="divide-y divide-border">
                {tagSlices.map((slice) => (
                  <div key={slice.tag} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">#{slice.tag}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {slice.completed}/{slice.count} done
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
