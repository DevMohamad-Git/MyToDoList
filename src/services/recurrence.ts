import { addDays, addMonths, addWeeks, addYears, getDate, setDate } from 'date-fns'
import type { Recurrence, WeekDay } from '@/types'

/**
 * Recurrence engine.
 *
 * Deliberately narrow: daily / weekly (with weekday selection) / monthly (with a
 * day-of-month) / yearly, each with an interval, and terminated by either an
 * `until` date or an occurrence `count`. This covers what a personal planner
 * needs without importing a full RRULE implementation.
 *
 * All functions are pure so recurrence behaviour is unit-testable.
 */

/** Would the rule produce another occurrence, given how many already exist? */
export function hasRemainingOccurrences(rule: Recurrence): boolean {
  if (rule.count != null && rule.generated + 1 >= rule.count) return false
  return true
}

/**
 * The next occurrence strictly after `from`, or `null` when the rule has ended.
 *
 * Monthly recurrence clamps to the end of short months: the 31st of January
 * recurring monthly lands on 28/29 February rather than skipping to March.
 */
export function nextOccurrence(rule: Recurrence, from: Date): Date | null {
  if (!hasRemainingOccurrences(rule)) return null

  const interval = Math.max(1, Math.floor(rule.interval || 1))
  let next: Date

  switch (rule.frequency) {
    case 'daily':
      next = addDays(from, interval)
      break

    case 'weekly': {
      if (rule.weekDays.length > 0) {
        const found = nextWeekdayOccurrence(from, rule.weekDays, interval)
        if (!found) return null
        next = found
      } else {
        next = addWeeks(from, interval)
      }
      break
    }

    case 'monthly': {
      const target = rule.monthDay ?? getDate(from)
      const candidate = addMonths(from, interval)
      const daysInMonth = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate()
      next = setDate(candidate, Math.min(target, daysInMonth))
      break
    }

    case 'yearly':
      next = addYears(from, interval)
      break

    default:
      return null
  }

  if (rule.until && next.getTime() > new Date(rule.until).getTime()) return null
  return next
}

/**
 * Walk forward to the next selected weekday, preserving the time of day. When the
 * interval is >1 the walk skips whole weeks after wrapping past the week's last
 * selected day, so "every 2 weeks on Mon+Thu" behaves correctly.
 */
function nextWeekdayOccurrence(from: Date, weekDays: WeekDay[], interval: number): Date | null {
  const sorted = [...new Set(weekDays)].sort((a, b) => a - b)
  if (sorted.length === 0) return null

  const currentDay = from.getDay() as WeekDay
  const laterThisWeek = sorted.find((d) => d > currentDay)

  if (laterThisWeek !== undefined) {
    return addDays(from, laterThisWeek - currentDay)
  }
  // Wrap into a following week, honouring the interval.
  const first = sorted[0]
  const daysToNextWeekStart = 7 - currentDay + first
  return addDays(from, daysToNextWeekStart + (interval - 1) * 7)
}

/**
 * Expand a rule into concrete dates for preview purposes ("next 5 occurrences").
 * Bounded by `limit` so a malformed rule can never spin.
 */
export function upcomingOccurrences(rule: Recurrence, start: Date, limit = 5): Date[] {
  const out: Date[] = []
  let cursor = start
  let generated = rule.generated
  for (let i = 0; i < limit; i++) {
    const next = nextOccurrence({ ...rule, generated }, cursor)
    if (!next) break
    out.push(next)
    cursor = next
    generated += 1
  }
  return out
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Human-readable rule summary shown on the task card, e.g. "Every 2 weeks on Mon, Thu". */
export function describeRecurrence(rule: Recurrence | null): string {
  if (!rule) return 'Does not repeat'
  const n = Math.max(1, rule.interval || 1)

  let base: string
  switch (rule.frequency) {
    case 'daily':
      base = n === 1 ? 'Every day' : `Every ${n} days`
      break
    case 'weekly': {
      const prefix = n === 1 ? 'Every week' : `Every ${n} weeks`
      base =
        rule.weekDays.length > 0
          ? `${prefix} on ${[...rule.weekDays].sort((a, b) => a - b).map((d) => WEEKDAY_NAMES[d]).join(', ')}`
          : prefix
      break
    }
    case 'monthly':
      base = n === 1 ? 'Every month' : `Every ${n} months`
      if (rule.monthDay) base += ` on day ${rule.monthDay}`
      break
    case 'yearly':
      base = n === 1 ? 'Every year' : `Every ${n} years`
      break
    default:
      base = 'Repeats'
  }

  if (rule.count != null) {
    const left = Math.max(0, rule.count - rule.generated)
    base += `, ${left} occurrence${left === 1 ? '' : 's'} left`
  } else if (rule.until) {
    base += `, until ${new Date(rule.until).toLocaleDateString()}`
  }
  return base
}
