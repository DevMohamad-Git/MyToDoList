import { db } from '@/database/db'
import { createHabit } from '@/database/factories'
import { logActivity } from '@/storage/activityRepo'
import type { DayKey, Habit, HabitEntry, ID } from '@/types'
import { nowISO } from '@/utils/date'
import { newId } from '@/utils/id'
import { byOrderThenCreated } from '@/utils/math'

export const habitRepo = {
  get(id: ID) {
    return db.habits.get(id)
  },

  async list(workspaceId: ID, includeArchived = false): Promise<Habit[]> {
    const rows = await db.habits.where('workspaceId').equals(workspaceId).toArray()
    return rows.filter((h) => includeArchived || !h.archived).sort(byOrderThenCreated)
  },

  async create(workspaceId: ID, input: Partial<Habit> = {}): Promise<Habit> {
    const habit = createHabit(workspaceId, input)
    await db.habits.add(habit)
    await logActivity(workspaceId, 'habit_created', 'habit', habit.id, `Created habit “${habit.title}”`)
    return habit
  },

  async update(id: ID, patch: Partial<Habit>): Promise<Habit | undefined> {
    const before = await db.habits.get(id)
    if (!before) return undefined
    const next = { ...before, ...patch, updatedAt: nowISO() }
    await db.habits.put(next)
    return next
  },

  async remove(id: ID): Promise<void> {
    const habit = await db.habits.get(id)
    if (!habit) return
    await db.habitEntries.where('habitId').equals(id).delete()
    await db.habits.delete(id)
  },

  entries(workspaceId: ID) {
    return db.habitEntries.where('workspaceId').equals(workspaceId).toArray()
  },

  entriesForHabit(habitId: ID) {
    return db.habitEntries.where('habitId').equals(habitId).toArray()
  },

  entriesBetween(workspaceId: ID, startDay: DayKey, endDay: DayKey) {
    return db.habitEntries
      .where('[workspaceId+day]')
      .between([workspaceId, startDay], [workspaceId, endDay], true, true)
      .toArray()
  },

  async entryFor(habitId: ID, day: DayKey): Promise<HabitEntry | undefined> {
    return db.habitEntries.where('[habitId+day]').equals([habitId, day]).first()
  },

  /**
   * Increment a habit's count for a day, wrapping back to zero once the target
   * is met. One control handles log / add-another / undo, which is what makes
   * the habit grid usable with a single click per cell.
   */
  async cycle(workspaceId: ID, habitId: ID, day: DayKey, target: number): Promise<number> {
    const existing = await habitRepo.entryFor(habitId, day)
    const nextCount = existing ? (existing.count >= target ? 0 : existing.count + 1) : 1

    if (nextCount === 0 && existing) {
      await db.habitEntries.delete(existing.id)
      return 0
    }
    if (existing) {
      await db.habitEntries.update(existing.id, { count: nextCount })
    } else {
      await db.habitEntries.add({
        id: newId(),
        workspaceId,
        habitId,
        day,
        count: nextCount,
        note: '',
        createdAt: nowISO(),
      })
      const habit = await db.habits.get(habitId)
      if (habit) {
        await logActivity(workspaceId, 'habit_logged', 'habit', habitId, `Logged “${habit.title}”`, { day })
      }
    }
    return nextCount
  },

  async setCount(workspaceId: ID, habitId: ID, day: DayKey, count: number): Promise<void> {
    const existing = await habitRepo.entryFor(habitId, day)
    if (count <= 0) {
      if (existing) await db.habitEntries.delete(existing.id)
      return
    }
    if (existing) await db.habitEntries.update(existing.id, { count })
    else
      await db.habitEntries.add({
        id: newId(),
        workspaceId,
        habitId,
        day,
        count,
        note: '',
        createdAt: nowISO(),
      })
  },

  async reorder(ids: ID[]): Promise<void> {
    await db.transaction('rw', db.habits, async () => {
      for (let i = 0; i < ids.length; i++) {
        await db.habits.update(ids[i], { order: i, updatedAt: nowISO() })
      }
    })
  },
}
