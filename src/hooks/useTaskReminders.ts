import { useEffect, useRef } from 'react'
import { toast } from '@/components/ui'
import { CLOSED_TASK_STATUSES } from '@/config/constants'
import { useT } from '@/i18n'
import {
  createWorkerTicker,
  playNotificationChime,
  sendDesktopNotification,
} from '@/services/notifications'
import { taskRepo } from '@/storage/taskRepo'
import type { ID } from '@/types'
import { dayRange, toDayKey, toISO } from '@/utils/date'

/**
 * Global background task reminder hook.
 *
 * Runs continuously at the application shell level (AppShell) using an unthrottled Web Worker ticker
 * so notifications fire accurately even if the tab is inactive or in the background while the user
 * is in another app or watching YouTube.
 */
export function useTaskReminders(workspaceId: ID) {
  const t = useT()
  const alertedIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!workspaceId) return

    // Load any previously alerted task IDs for today from sessionStorage to avoid repeat alerts
    const todayKey = toDayKey(new Date())
    const storageKey = `flow_alerted_${todayKey}`
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved) {
        alertedIdsRef.current = new Set(JSON.parse(saved))
      }
    } catch {
      // Ignore storage errors
    }

    async function checkReminders() {
      const now = new Date()
      const currentDay = toDayKey(now)
      const { start, end } = dayRange(currentDay)

      try {
        const scheduled = await taskRepo.scheduledBetween(
          workspaceId,
          toISO(start),
          toISO(end),
        )

        for (const task of scheduled) {
          if (CLOSED_TASK_STATUSES.includes(task.status) || !task.startDate) continue

          const startTime = new Date(task.startDate).getTime()
          const nowTime = now.getTime()
          const diffMinutes = (nowTime - startTime) / 60_000

          // Trigger if current time has reached or entered within the first 15 minutes of the task
          if (diffMinutes >= 0 && diffMinutes <= 15) {
            if (!alertedIdsRef.current.has(task.id)) {
              alertedIdsRef.current.add(task.id)

              try {
                sessionStorage.setItem(
                  storageKey,
                  JSON.stringify(Array.from(alertedIdsRef.current)),
                )
              } catch {
                // Ignore storage errors
              }

              playNotificationChime()

              const title = t('plannerTransitionTitle', { title: task.title })
              const body = t('plannerTransitionDesc', { title: task.title })

              void sendDesktopNotification({
                title,
                body,
                tag: `task-${task.id}`,
              })

              toast.info(title)
            }
          }
        }
      } catch (err) {
        console.error('Failed checking scheduled task reminders:', err)
      }
    }

    // Run immediate check on mount
    void checkReminders()

    // Unthrottled worker ticker every 15s to bypass Chrome background tab suspension
    const stopTicker = createWorkerTicker(() => {
      void checkReminders()
    }, 15_000)

    return () => {
      stopTicker()
    }
  }, [workspaceId, t])
}
