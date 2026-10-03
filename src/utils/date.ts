import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { enUS, faIR } from 'date-fns/locale'
import type { Locale } from 'date-fns'
import { t, useI18n } from '@/i18n'
import type { DayKey, ISODateTime, WeekDay } from '@/types'

/**
 * Day keys are **local** calendar days (`yyyy-MM-dd`), not UTC. A task due at
 * 23:00 local on the 26th belongs to the 26th regardless of the UTC offset, so
 * every bucketing operation in the app funnels through `toDayKey`.
 */
export function toDayKey(date: Date | ISODateTime): DayKey {
  return format(typeof date === 'string' ? parseISO(date) : date, 'yyyy-MM-dd')
}

/** Parse a `yyyy-MM-dd` key back into local midnight. */
export function fromDayKey(day: DayKey): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0)
}

export function todayKey(now: Date = new Date()): DayKey {
  return toDayKey(now)
}

export function toISO(date: Date): ISODateTime {
  return date.toISOString()
}

export function nowISO(): ISODateTime {
  return new Date().toISOString()
}

export function parse(value: ISODateTime): Date {
  return parseISO(value)
}

/** Minutes from local midnight → a `Date` on the given day. */
export function dayAtMinutes(day: Date | DayKey, minutes: number): Date {
  const base = typeof day === 'string' ? fromDayKey(day) : startOfDay(day)
  return new Date(base.getTime() + minutes * 60_000)
}

/** Minutes elapsed from local midnight for an instant. */
export function minutesIntoDay(date: Date | ISODateTime): number {
  const d = typeof date === 'string' ? parseISO(date) : date
  return d.getHours() * 60 + d.getMinutes()
}

export function dayRange(day: Date | DayKey): { start: Date; end: Date } {
  const base = typeof day === 'string' ? fromDayKey(day) : day
  return { start: startOfDay(base), end: endOfDay(base) }
}

export function weekRange(date: Date, weekStartsOn: WeekDay) {
  return {
    start: startOfWeek(date, { weekStartsOn }),
    end: endOfWeek(date, { weekStartsOn }),
  }
}

export function monthRange(date: Date) {
  return { start: startOfMonth(date), end: endOfMonth(date) }
}

export function daysBetween(start: Date, end: Date): Date[] {
  if (end < start) return []
  return eachDayOfInterval({ start, end })
}

export function dayKeysBetween(start: Date, end: Date): DayKey[] {
  return daysBetween(start, end).map(toDayKey)
}

/**
 * Calendar grid for a month view: always whole weeks so the grid is rectangular.
 */
export function monthGridDays(date: Date, weekStartsOn: WeekDay): Date[] {
  const first = startOfWeek(startOfMonth(date), { weekStartsOn })
  const last = endOfWeek(endOfMonth(date), { weekStartsOn })
  return eachDayOfInterval({ start: first, end: last })
}

export function weekDays(date: Date, weekStartsOn: WeekDay): Date[] {
  const start = startOfWeek(date, { weekStartsOn })
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export { isSameDay, differenceInCalendarDays, startOfDay, endOfDay, addDays }

/* ------------------------------------------------------------- formatting -- */

/** The date-fns locale matching the UI language (Persian month/day names). */
function activeDateLocale(): Locale {
  return useI18n.getState().language === 'fa' ? faIR : enUS
}

/**
 * Human duration. Long form is the default (`6 hours and 25 minutes` /
 * `۶ ساعت و ۲۵ دقیقه`) so mixed digits don't scramble in RTL. Pass
 * `{ compact: true }` for dense badges (`1h 35m` / `1س 35د`).
 */
export function formatDuration(
  minutes: number | null | undefined,
  options?: { compact?: boolean },
): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—'
  const total = Math.round(minutes)
  const compact = options?.compact === true
  if (total === 0) return t(compact ? 'durZeroShort' : 'durZero')
  const sign = total < 0 ? '-' : ''
  const abs = Math.abs(total)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  if (h === 0) return sign + t(compact ? 'durMShort' : 'durM', { m })
  if (m === 0) return sign + t(compact ? 'durHShort' : 'durH', { h })
  return sign + t(compact ? 'durHmShort' : 'durHm', { h, m })
}

/** `540` → `"09:00"`. Minutes-from-midnight to a 24h clock label. */
export function formatMinutesOfDay(minutes: number): string {
  const clamped = ((Math.round(minutes) % 1440) + 1440) % 1440
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function formatClock(value: ISODateTime | Date): string {
  const d = typeof value === 'string' ? parseISO(value) : value
  return format(d, 'HH:mm')
}

export function formatDate(value: ISODateTime | Date, pattern = 'd MMM yyyy'): string {
  const d = typeof value === 'string' ? parseISO(value) : value
  return format(d, pattern, { locale: activeDateLocale() })
}

export function formatDayLabel(day: DayKey): string {
  return format(fromDayKey(day), 'EEE d MMM', { locale: activeDateLocale() })
}

/** Human relative deadline: "Today", "Tomorrow", "3d overdue", "in 5d". */
export function formatRelativeDay(value: ISODateTime, now: Date = new Date()): string {
  const diff = differenceInCalendarDays(parseISO(value), now)
  if (diff === 0) return t('dToday')
  if (diff === 1) return t('dTomorrow')
  if (diff === -1) return t('dYesterday')
  if (diff < 0) return t('dOverdueBy', { n: Math.abs(diff) })
  if (diff <= 7) return t('dInDays', { n: diff })
  return format(parseISO(value), 'd MMM', { locale: activeDateLocale() })
}

/** `1536` → `"1.5 KB"`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** i
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

/** Seconds → `mm:ss` (or `h:mm:ss` past an hour). Used by the focus timer. */
export function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/**
 * `<input type="datetime-local">` needs a local, offset-free string; `.toISOString()`
 * would silently shift the value by the UTC offset.
 */
export function toDateTimeInput(value: ISODateTime | null): string {
  if (!value) return ''
  return format(parseISO(value), "yyyy-MM-dd'T'HH:mm")
}

export function fromDateTimeInput(value: string): ISODateTime | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function toDateInput(value: ISODateTime | null): string {
  if (!value) return ''
  return format(parseISO(value), 'yyyy-MM-dd')
}

export function fromDateInput(value: string): ISODateTime | null {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString()
}
