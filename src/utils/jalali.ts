/**
 * Jalali (Shamsi) calendar adapter.
 *
 * Wraps `date-fns-jalali` functions so the rest of the app can work with
 * Jalali dates for **display** while keeping internal storage in Gregorian
 * (ISO-8601) format. Every function here operates on native `Date` objects
 * (which are always Gregorian internally) but formats / calculates boundaries
 * using the Jalali calendar.
 */

import {
  format as jFormat,
  startOfMonth as jStartOfMonth,
  endOfMonth as jEndOfMonth,
  startOfWeek as jStartOfWeek,
  endOfWeek as jEndOfWeek,
  eachDayOfInterval as jEachDayOfInterval,
  getMonth as jGetMonth,
  getYear as jGetYear,
  getDate as jGetDate,
  parseISO,
} from 'date-fns-jalali'
import { faIR } from 'date-fns-jalali/locale'
import type { ISODateTime, WeekDay } from '@/types'

/* ------------------------------------------------------ formatting helpers -- */

/**
 * Format a date using Jalali calendar.
 * Pattern tokens are the same as date-fns (`yyyy`, `MM`, `dd`, `MMM`, etc.)
 * but produce Jalali values.
 */
export function formatJalali(
  value: ISODateTime | Date,
  pattern = 'd MMMM yyyy',
): string {
  const d = typeof value === 'string' ? parseISO(value) : value
  const normalizedPattern = pattern.includes('MMMM') ? pattern : pattern.replace(/\bMMM\b/g, 'MMMM')
  return jFormat(d, normalizedPattern, { locale: faIR })
}

/** Convert ASCII digits (0-9) to Persian digits (۰-۹). */
export function toPersianDigits(value: number | string): string {
  const digits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
  return String(value).replace(/\d/g, (d) => digits[Number(d)] ?? d)
}

/** Convert Persian digits (۰-۹) or Arabic-Indic digits (٠-٩) to ASCII digits (0-9). */
export function fromPersianDigits(value: string): string {
  const map: Record<string, string> = {
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  }
  return value.replace(/[۰-۹٠-٩]/g, (d) => map[d] ?? d)
}

/** Jalali day label: e.g. "شنبه ۱۵ مهر" */
export function formatJalaliDayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0)
  return toPersianDigits(jFormat(date, 'EEE d MMMM', { locale: faIR }))
}

/** Jalali date for display: `yyyy/MM/dd` */
export function toJalaliDisplay(date: Date): string {
  return toPersianDigits(jFormat(date, 'yyyy/MM/dd', { locale: faIR }))
}

/** Get Jalali year, month (1-based), day of a Gregorian Date */
export function toJalaliParts(date: Date): { year: number; month: number; day: number } {
  return {
    year: jGetYear(date),
    month: jGetMonth(date) + 1, // date-fns months are 0-based
    day: jGetDate(date),
  }
}

/* --------------------------------------------------- calendar grid helpers -- */

/**
 * Calendar grid for a Jalali month view.
 * Returns an array of Dates covering full weeks for the month containing `date`.
 */
export function jalaliMonthGridDays(date: Date, weekStartsOn: WeekDay): Date[] {
  const first = jStartOfWeek(jStartOfMonth(date), { weekStartsOn })
  const last = jEndOfWeek(jEndOfMonth(date), { weekStartsOn })
  return jEachDayOfInterval({ start: first, end: last })
}

/** Start and end of a Jalali month containing `date`. */
export function jalaliMonthRange(date: Date) {
  return { start: jStartOfMonth(date), end: jEndOfMonth(date) }
}

/** Week boundaries in Jalali calendar. */
export function jalaliWeekRange(date: Date, weekStartsOn: WeekDay) {
  return {
    start: jStartOfWeek(date, { weekStartsOn }),
    end: jEndOfWeek(date, { weekStartsOn }),
  }
}

/* ----------------------------------------------- Jalali month/year labels -- */

const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد',
  'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر',
  'دی', 'بهمن', 'اسفند',
] as const

export function jalaliMonthName(monthIndex: number): string {
  return JALALI_MONTHS[monthIndex] ?? ''
}

/** "مهر ۱۴۰۵" */
export function jalaliMonthYearLabel(date: Date): string {
  const parts = toJalaliParts(date)
  return `${jalaliMonthName(parts.month - 1)} ${toPersianDigits(parts.year)}`
}

/** Number of days in a Jalali month (1-based month). */
export function jalaliDaysInMonth(year: number, month: number): number {
  if (month <= 6) return 31
  if (month <= 11) return 30
  // Month 12 (Esfand): 29 in normal years, 30 in leap years
  return isJalaliLeapYear(year) ? 30 : 29
}

/** Check if a Jalali year is a leap year. */
export function isJalaliLeapYear(year: number): boolean {
  const breaks = [
    1, 5, 9, 13, 17, 22, 26, 30,
  ]
  const mod = year % 33
  return breaks.includes(mod)
}
