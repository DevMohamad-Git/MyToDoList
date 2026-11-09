import {
  Calendar,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  toast,
} from '@/components/ui'
import { reviewRepo } from '@/storage/reviewRepo'
import { useT } from '@/i18n'
import type { DailyReview, DayKey, ID, WeeklyReview } from '@/types'
import { cn } from '@/utils/cn'
import { formatDayLabel, fromDayKey } from '@/utils/date'
import { formatJalali, toPersianDigits } from '@/utils/jalali'

interface ReviewHistoryProps {
  daily?: DailyReview[]
  weekly?: WeeklyReview[]
  onSelectDaily: (day: DayKey) => void
  onSelectWeekly: (weekStart: DayKey) => void
}

interface ReviewHistoryRow {
  key: string
  id: ID
  type: 'daily' | 'weekly'
  when: DayKey
  title: string
  score: number
  excerpt?: string
  monthGroup: string
}

const PAGE_SIZE = 20

export function ReviewHistory({
  daily = [],
  weekly = [],
  onSelectDaily,
  onSelectWeekly,
}: ReviewHistoryProps) {
  const t = useT()
  const [filter, setFilter] = useState<'all' | 'daily' | 'weekly'>('all')
  const [search, setSearch] = useState('')
  const [density, setDensity] = useState<'compact' | 'detailed'>('compact')
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [deletingRow, setDeletingRow] = useState<ReviewHistoryRow | null>(null)
  const [busyDelete, setBusyDelete] = useState(false)

  if (daily.length === 0 && weekly.length === 0) return null

  // Normalize all rows with month grouping
  const allRows: ReviewHistoryRow[] = useMemo(() => {
    return [
      ...daily.map((r) => {
        let month = ''
        try {
          month = toPersianDigits(formatJalali(fromDayKey(r.day), 'MMMM yyyy'))
        } catch {
          month = r.day.slice(0, 7)
        }
        return {
          key: r.id,
          id: r.id,
          type: 'daily' as const,
          when: r.day,
          title: `${t('reviewsTabDaily')} · ${formatDayLabel(r.day)}`,
          score: r.score,
          excerpt: r.wentWell || r.notes,
          monthGroup: month,
        }
      }),
      ...weekly.map((r) => {
        let month = ''
        try {
          month = toPersianDigits(formatJalali(fromDayKey(r.weekStart), 'MMMM yyyy'))
        } catch {
          month = r.weekStart.slice(0, 7)
        }
        return {
          key: r.id,
          id: r.id,
          type: 'weekly' as const,
          when: r.weekStart,
          title: `${t('reviewsTabWeekly')} · ${formatDayLabel(r.weekStart)}`,
          score: r.score,
          excerpt: r.highlights || r.notes,
          monthGroup: month,
        }
      }),
    ].sort((a, b) => b.when.localeCompare(a.when))
  }, [daily, weekly, t])

  // Filtered rows by type & keyword
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return allRows.filter((r) => {
      const matchType = filter === 'all' || r.type === filter
      if (!matchType) return false
      if (!query) return true
      return (
        r.title.toLowerCase().includes(query) ||
        r.when.toLowerCase().includes(query) ||
        (r.excerpt && r.excerpt.toLowerCase().includes(query))
      )
    })
  }, [allRows, filter, search])

  // Average score metric
  const avgScore = useMemo(() => {
    const valid = filteredRows.filter((r) => r.score > 0)
    if (valid.length === 0) return 0
    return Math.round(valid.reduce((acc, r) => acc + r.score, 0) / valid.length)
  }, [filteredRows])

  // Visible sliced rows
  const visibleRows = filteredRows.slice(0, visibleCount)
  const hasMore = filteredRows.length > visibleCount

  // Group by month
  const groupedByMonth = useMemo(() => {
    const map = new Map<string, ReviewHistoryRow[]>()
    for (const row of visibleRows) {
      const list = map.get(row.monthGroup) ?? []
      list.push(row)
      map.set(row.monthGroup, list)
    }
    return Array.from(map.entries())
  }, [visibleRows])

  const handleConfirmDelete = async () => {
    if (!deletingRow) return
    setBusyDelete(true)
    try {
      if (deletingRow.type === 'daily') {
        await reviewRepo.removeDaily(deletingRow.id)
      } else {
        await reviewRepo.removeWeekly(deletingRow.id)
      }
      toast.success(t('reviewsToastSaved', { day: deletingRow.when }))
      setDeletingRow(null)
    } catch {
      toast.error('خطا در حذف مرور')
    } finally {
      setBusyDelete(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title={
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-accent" />
              <span>{t('reviewsHistoryTitle')}</span>
              <Badge className="ms-1 font-mono text-[11px] py-0 px-2">
                {allRows.length} مرور
              </Badge>
              {avgScore > 0 && (
                <Badge className="font-mono text-[11px] py-0 px-2 bg-accent/10 text-accent border-accent/20 hidden sm:inline-flex">
                  میانگین: {avgScore}٪
                </Badge>
              )}
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              {/* Filter tabs */}
              <div className="flex gap-1 bg-muted/40 p-0.5 rounded-lg border border-border">
                {(['all', 'daily', 'weekly'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setFilter(mode)
                      setVisibleCount(PAGE_SIZE)
                    }}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                      filter === mode
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {mode === 'all'
                      ? t('reviewsHistoryFilterAll')
                      : mode === 'daily'
                        ? t('reviewsHistoryFilterDaily')
                        : t('reviewsHistoryFilterWeekly')}
                  </button>
                ))}
              </div>

              {/* Collapse/Expand Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsCollapsed((prev) => !prev)}
                title={isCollapsed ? 'باز کردن لیست تاریخچه' : 'بستن لیست تاریخچه'}
                className="size-8"
              >
                {isCollapsed ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronUp className="size-4" />
                )}
              </Button>
            </div>
          }
        />

        {!isCollapsed && (
          <div className="flex flex-col">
            {/* Control Bar: Search & Density Switch */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-b border-border bg-muted/20">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="size-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setVisibleCount(PAGE_SIZE)
                  }}
                  placeholder="جستجو در تأملات، دستاوردها و یادداشت‌ها…"
                  className="w-full h-8 ps-8 pe-7 rounded-lg border border-border bg-card text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-accent"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>

              {/* Density Switch */}
              <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border border-border text-xs">
                <button
                  type="button"
                  onClick={() => setDensity('compact')}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-md transition-colors',
                    density === 'compact'
                      ? 'bg-card text-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  title="نمای فشرده (اشغال فضای کمتر)"
                >
                  <List className="size-3.5" />
                  <span>فشرده</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDensity('detailed')}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-md transition-colors',
                    density === 'detailed'
                      ? 'bg-card text-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  title="نمای با جزئیات کامل"
                >
                  <LayoutGrid className="size-3.5" />
                  <span>تفصیلی</span>
                </button>
              </div>
            </div>

            {/* List Content */}
            {filteredRows.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground italic">
                {search
                  ? 'هیچ مروری متناسب با جستجوی شما پیدا نشد.'
                  : t('reviewsHistoryEmpty')}
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {groupedByMonth.map(([month, rowsInMonth]) => (
                  <div key={month} className="flex flex-col">
                    {/* Month Header Banner */}
                    <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-1.5 bg-muted/70 backdrop-blur-sm border-b border-border/40 text-[11px] font-bold text-muted-foreground">
                      <span>{month}</span>
                      <span className="font-mono text-[10px] opacity-75">
                        {rowsInMonth.length} مرور
                      </span>
                    </div>

                    {/* Month's Rows */}
                    <div className="divide-y divide-border/40">
                      {rowsInMonth.map((row) => {
                        const isWeekly = row.type === 'weekly'

                        if (density === 'compact') {
                          return (
                            <div
                              key={row.key}
                              onClick={() => {
                                if (row.type === 'daily') onSelectDaily(row.when)
                                else onSelectWeekly(row.when)
                              }}
                              className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-muted/40 cursor-pointer transition-colors group"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <Badge
                                  className={cn(
                                    'text-[10px] py-0 px-1.5 shrink-0',
                                    isWeekly
                                      ? 'bg-accent/15 text-accent border-accent/30'
                                      : 'text-muted-foreground',
                                  )}
                                >
                                  {isWeekly ? 'هفتگی' : 'روزانه'}
                                </Badge>
                                <span className="text-xs font-semibold shrink-0 group-hover:text-accent transition-colors">
                                  {formatDayLabel(row.when, { short: true })}
                                </span>
                                {row.excerpt && (
                                  <span className="text-xs text-muted-foreground truncate hidden sm:inline max-w-md">
                                    {row.excerpt}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {row.score > 0 && (
                                  <Badge className="font-mono text-[11px] py-0 px-1.5">
                                    {row.score}%
                                  </Badge>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-opacity"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setDeletingRow(row)
                                  }}
                                  title={t('cDelete')}
                                >
                                  <Trash2 className="size-3" />
                                </Button>
                              </div>
                            </div>
                          )
                        }

                        // Detailed View
                        return (
                          <div
                            key={row.key}
                            onClick={() => {
                              if (row.type === 'daily') onSelectDaily(row.when)
                              else onSelectWeekly(row.when)
                            }}
                            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer transition-colors group"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Badge
                                  className={cn(
                                    'text-[10px] py-0 px-1.5',
                                    isWeekly
                                      ? 'bg-accent/15 text-accent border-accent/30'
                                      : 'text-muted-foreground',
                                  )}
                                >
                                  {isWeekly
                                    ? t('reviewsHistoryFilterWeekly')
                                    : t('reviewsHistoryFilterDaily')}
                                </Badge>
                                <span className="truncate text-sm font-semibold group-hover:text-accent transition-colors">
                                  {row.title}
                                </span>
                              </div>
                              {row.excerpt && (
                                <p className="truncate text-xs text-muted-foreground mt-1 ps-1">
                                  {row.excerpt}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {row.score > 0 && (
                                <Badge className="font-mono text-xs">{row.score}%</Badge>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDeletingRow(row)
                                }}
                                title={t('cDelete')}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination Button */}
            {hasMore && (
              <div className="p-3 border-t border-border flex justify-center bg-muted/10">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                  className="text-xs"
                >
                  <ChevronDown className="size-3.5 me-1" />
                  نمایش بیشتر ({filteredRows.length - visibleCount} مرور دیگر)
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Confirmation Modal */}
      <ConfirmDialog
        open={deletingRow !== null}
        onClose={() => setDeletingRow(null)}
        onConfirm={handleConfirmDelete}
        busy={busyDelete}
        title="حذف مرور ثبت‌شده؟"
        message={
          deletingRow ? (
            <>
              آیا از حذف مرور «{deletingRow.title}» اطمینان دارید؟ تمام یادداشت‌ها و
              تأملات ثبت‌شده برای این تاریخ پاک خواهند شد.
            </>
          ) : (
            ''
          )
        }
        confirmLabel={t('cDelete')}
        cancelLabel={t('cCancel')}
        destructive
      />
    </>
  )
}
