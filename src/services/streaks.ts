import { differenceInCalendarDays, startOfWeek } from 'date-fns'
import type { DayKey, Habit, HabitEntry, WeekDay } from '@/types'
import { fromDayKey, toDayKey } from '@/utils/date'
import { ratio, toPercent } from '@/utils/math'

/**
 * Streak and consistency computation for habits, plus the app-wide activity
 * streak used by the dashboard and achievements.
 *
 * Key design decision: **today never breaks a streak.** A daily habit not yet
 * logged today still shows yesterday's streak, because penalising the user at
 * 00:01 for not having done their habit yet is hostile and wrong. The streak
 * only breaks once a *completed* day has been missed.
 */

export interface StreakResult {
  current: number
  longest: number
  /** Share of due days that were satisfied, 0–100. */
  consistency: number
  /** Days the habit was due within the evaluated window. */
  dueDays: number
  completedDays: number
  totalCompletions: number
}

/** Is the habit due on this date, per its frequency? */
export function isHabitDue(habit: Habit, date: Date): boolean {
  switch (habit.frequency) {
    case 'daily':
      return true
    case 'weekly':
      // Weekly habits are evaluated per week, not per day; every day is a valid
      // opportunity to satisfy the week's target.
      return true
    case 'custom':
      return habit.weekDays.includes(date.getDay() as WeekDay)
    default:
      return false
  }
}

function completionsByDay(entries: HabitEntry[]): Map<DayKey, number> {
  const map = new Map<DayKey, number>()
  for (const entry of entries) {
    map.set(entry.day, (map.get(entry.day) ?? 0) + entry.count)
  }
  return map
}

/**
 * Streaks for daily and custom-frequency habits, counted in due days.
 * `since` bounds the consistency window (defaults to the habit's creation date).
 */
export function habitStreak(
  habit: Habit,
  entries: HabitEntry[],
  now: Date = new Date(),
  weekStartsOn: WeekDay = 1,
): StreakResult {
  const own = entries.filter((e) => e.habitId === habit.id)
  const byDay = completionsByDay(own)
  const totalCompletions = own.reduce((acc, e) => acc + e.count, 0)

  if (habit.frequency === 'weekly') {
    return weeklyHabitStreak(habit, own, now, weekStartsOn)
  }

  const target = Math.max(1, habit.target)
  const start = fromDayKey(toDayKey(habit.createdAt))
  const today = fromDayKey(toDayKey(now))
  const span = Math.max(0, differenceInCalendarDays(today, start))

  let dueDays = 0
  let completedDays = 0
  let current = 0
  let longest = 0
  let running = 0

  // Walk forward from creation so `longest` is computed over full history.
  for (let i = 0; i <= span; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    if (!isHabitDue(habit, date)) continue
    dueDays++
    const done = (byDay.get(toDayKey(date)) ?? 0) >= target
    if (done) {
      completedDays++
      running++
      longest = Math.max(longest, running)
    } else {
      running = 0
    }
  }

  // Recount the current streak backwards, skipping an unfinished today.
  let cursor = today
  if (!(byDay.get(toDayKey(cursor)) ?? 0) || (byDay.get(toDayKey(cursor)) ?? 0) < target) {
    // Today is incomplete — start from yesterday so it does not zero the streak.
    if (isHabitDue(habit, cursor)) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1)
    }
  }
  let guard = 0
  while (guard++ < 3650) {
    if (cursor < start) break
    if (!isHabitDue(habit, cursor)) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1)
      continue
    }
    if ((byDay.get(toDayKey(cursor)) ?? 0) >= target) {
      current++
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1)
    } else {
      break
    }
  }
  longest = Math.max(longest, current)

  return {
    current,
    longest,
    consistency: toPercent(ratio(completedDays, dueDays) * 100),
    dueDays,
    completedDays,
    totalCompletions,
  }
}

/** Weekly habits: a "streak day" is a satisfied week. */
function weeklyHabitStreak(
  habit: Habit,
  entries: HabitEntry[],
  now: Date,
  weekStartsOn: WeekDay,
): StreakResult {
  const target = Math.max(1, habit.target)
  const byWeek = new Map<string, number>()
  for (const entry of entries) {
    const key = toDayKey(startOfWeek(fromDayKey(entry.day), { weekStartsOn }))
    byWeek.set(key, (byWeek.get(key) ?? 0) + entry.count)
  }

  const firstWeek = startOfWeek(fromDayKey(toDayKey(habit.createdAt)), { weekStartsOn })
  const thisWeek = startOfWeek(fromDayKey(toDayKey(now)), { weekStartsOn })
  const weeks = Math.max(0, Math.floor(differenceInCalendarDays(thisWeek, firstWeek) / 7))

  let completedWeeks = 0
  let longest = 0
  let running = 0
  const keys: string[] = []
  for (let i = 0; i <= weeks; i++) {
    const weekStart = new Date(firstWeek.getFullYear(), firstWeek.getMonth(), firstWeek.getDate() + i * 7)
    const key = toDayKey(weekStart)
    keys.push(key)
    if ((byWeek.get(key) ?? 0) >= target) {
      completedWeeks++
      running++
      longest = Math.max(longest, running)
    } else {
      running = 0
    }
  }

  // Current streak counted backwards; the in-progress week is not a failure yet.
  let current = 0
  for (let i = keys.length - 1; i >= 0; i--) {
    const satisfied = (byWeek.get(keys[i]) ?? 0) >= target
    if (satisfied) current++
    else if (i === keys.length - 1) continue
    else break
  }
  longest = Math.max(longest, current)

  return {
    current,
    longest,
    consistency: toPercent(ratio(completedWeeks, weeks + 1) * 100),
    dueDays: weeks + 1,
    completedDays: completedWeeks,
    totalCompletions: entries.reduce((acc, e) => acc + e.count, 0),
  }
}

/**
 * App-wide activity streak: consecutive days on which the user completed at least
 * one task or logged focus time. This is the number shown on the dashboard and
 * used by the streak achievements.
 */
export function activityStreak(activeDays: Set<DayKey>, now: Date = new Date()): { current: number; longest: number } {
  if (activeDays.size === 0) return { current: 0, longest: 0 }

  const sorted = Array.from(activeDays).sort()
  let longest = 1
  let running = 1
  for (let i = 1; i < sorted.length; i++) {
    const gap = differenceInCalendarDays(fromDayKey(sorted[i]), fromDayKey(sorted[i - 1]))
    if (gap === 1) {
      running++
      longest = Math.max(longest, running)
    } else if (gap > 1) {
      running = 1
    }
  }

  // Current streak walks back from today; an inactive today does not break it yet.
  const today = fromDayKey(toDayKey(now))
  let cursor = activeDays.has(toDayKey(today))
    ? today
    : new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  let current = 0
  let guard = 0
  while (activeDays.has(toDayKey(cursor)) && guard++ < 3650) {
    current++
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1)
  }

  return { current, longest: Math.max(longest, current) }
}
