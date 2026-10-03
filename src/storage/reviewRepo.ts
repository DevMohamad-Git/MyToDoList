import { db } from '@/database/db'
import { logActivity } from '@/storage/activityRepo'
import type { DailyReview, DayKey, EarnedAchievement, ID, WeeklyReview } from '@/types'
import { nowISO } from '@/utils/date'
import { newId } from '@/utils/id'

export const reviewRepo = {
  dailyFor(workspaceId: ID, day: DayKey) {
    return db.dailyReviews.where('[workspaceId+day]').equals([workspaceId, day]).first()
  },

  allDaily(workspaceId: ID) {
    return db.dailyReviews.where('workspaceId').equals(workspaceId).toArray()
  },

  dailyBetween(workspaceId: ID, startDay: DayKey, endDay: DayKey) {
    return db.dailyReviews
      .where('[workspaceId+day]')
      .between([workspaceId, startDay], [workspaceId, endDay], true, true)
      .toArray()
  },

  /** Upsert keyed on (workspace, day) so re-reviewing a day edits it in place. */
  async saveDaily(
    workspaceId: ID,
    day: DayKey,
    input: Omit<DailyReview, 'id' | 'workspaceId' | 'day' | 'createdAt' | 'updatedAt'>,
  ): Promise<DailyReview> {
    const existing = await reviewRepo.dailyFor(workspaceId, day)
    const record: DailyReview = existing
      ? { ...existing, ...input, updatedAt: nowISO() }
      : { id: newId(), workspaceId, day, ...input, createdAt: nowISO(), updatedAt: nowISO() }
    await db.dailyReviews.put(record)
    await logActivity(
      workspaceId,
      'review_saved',
      'review',
      record.id,
      `${existing ? 'Updated' : 'Completed'} daily review for ${day}`,
      { score: record.score, selfRating: record.selfRating },
    )
    return record
  },

  async removeDaily(id: ID): Promise<void> {
    await db.dailyReviews.delete(id)
  },

  weeklyFor(workspaceId: ID, weekStart: DayKey) {
    return db.weeklyReviews.where('[workspaceId+weekStart]').equals([workspaceId, weekStart]).first()
  },

  allWeekly(workspaceId: ID) {
    return db.weeklyReviews.where('workspaceId').equals(workspaceId).toArray()
  },

  async saveWeekly(
    workspaceId: ID,
    weekStart: DayKey,
    input: Omit<WeeklyReview, 'id' | 'workspaceId' | 'weekStart' | 'createdAt' | 'updatedAt'>,
  ): Promise<WeeklyReview> {
    const existing = await reviewRepo.weeklyFor(workspaceId, weekStart)
    const record: WeeklyReview = existing
      ? { ...existing, ...input, updatedAt: nowISO() }
      : { id: newId(), workspaceId, weekStart, ...input, createdAt: nowISO(), updatedAt: nowISO() }
    await db.weeklyReviews.put(record)
    await logActivity(
      workspaceId,
      'review_saved',
      'review',
      record.id,
      `${existing ? 'Updated' : 'Completed'} weekly review for week of ${weekStart}`,
      { score: record.score },
    )
    return record
  },

  async removeWeekly(id: ID): Promise<void> {
    await db.weeklyReviews.delete(id)
  },
}

export const achievementRepo = {
  list(workspaceId: ID) {
    return db.achievements.where('workspaceId').equals(workspaceId).toArray()
  },

  /** Idempotent: an achievement is only ever earned once per workspace. */
  async award(workspaceId: ID, achievementKey: string, value: number, title: string): Promise<EarnedAchievement | null> {
    const existing = await db.achievements
      .where('[workspaceId+achievementKey]')
      .equals([workspaceId, achievementKey])
      .first()
    if (existing) return null
    const record: EarnedAchievement = {
      id: newId(),
      workspaceId,
      achievementKey,
      earnedAt: nowISO(),
      value,
    }
    await db.achievements.add(record)
    await logActivity(
      workspaceId,
      'achievement_earned',
      'workspace',
      record.id,
      `Earned achievement “${title}”`,
      { key: achievementKey, value },
    )
    return record
  },

  async reset(workspaceId: ID): Promise<void> {
    await db.achievements.where('workspaceId').equals(workspaceId).delete()
  },
}
