import { subDays } from 'date-fns'
import { db } from '@/database/db'
import {
  createGoal,
  createHabit,
  createMilestone,
  createProject,
  createTask,
} from '@/database/factories'
import { workspaceRepo } from '@/storage/workspaceRepo'
import type { FocusSession, HabitEntry, ID, Task, TimeEntry, Workspace } from '@/types'
import { dayAtMinutes, toDayKey, toISO } from '@/utils/date'
import { newId } from '@/utils/id'

/**
 * Demo data generator.
 *
 * Produces ~30 days of history so the score, trends, streaks and analytics have
 * something real to describe on a fresh install — an empty local-first app shows
 * nothing but empty states, which makes it impossible to evaluate.
 *
 * Uses a seeded PRNG rather than `Math.random` so the demo workspace is
 * reproducible: the same install always yields the same charts, which makes bug
 * reports about analytics actionable.
 */

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PROJECT_SEEDS = [
  { name: 'Product Launch', color: '#6366f1', icon: 'rocket', priority: 'critical' as const },
  { name: 'Health & Fitness', color: '#22c55e', icon: 'heart', priority: 'high' as const },
  { name: 'Learning: Rust', color: '#f97316', icon: 'book', priority: 'medium' as const },
  { name: 'Home Admin', color: '#64748b', icon: 'home', priority: 'low' as const },
]

const TASK_TITLES = [
  'Draft the launch announcement',
  'Review analytics instrumentation',
  'Fix the onboarding drop-off',
  'Write integration tests',
  'Refactor the settings panel',
  'Prepare sprint demo',
  'Update the pricing page copy',
  'Triage inbound bug reports',
  'Record a walkthrough video',
  'Audit dependency licences',
  'Plan next quarter roadmap',
  'Migrate the legacy exporter',
  'Interview a design candidate',
  'Reconcile the monthly invoices',
  'Book the dentist appointment',
  'Renew the domain registration',
  'Read chapter 4 of the Rust book',
  'Implement the ownership exercises',
  'Run a 5k',
  'Meal-prep for the week',
  'Clear the email backlog',
  'Back up the photo library',
]

const TAGS = ['deep-work', 'admin', 'writing', 'review', 'errand', 'learning']

/**
 * Populate a workspace with demo content. The workspace is flagged `isDemo` so
 * Settings can offer to clear it in one step.
 */
export async function seedDemoWorkspace(name = 'Demo Workspace'): Promise<Workspace> {
  const workspace = await workspaceRepo.create({ name, isDemo: true, icon: 'sparkles' })
  await seedInto(workspace.id)
  await workspaceRepo.setActiveId(workspace.id)
  return workspace
}

/** Fill an existing (ideally empty) workspace with demo content. */
export async function seedInto(workspaceId: ID, now = new Date()): Promise<void> {
  const rand = mulberry32(20260826)
  const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)]

  /* ------------------------------------------------------------- projects -- */
  const projects = PROJECT_SEEDS.map((seed, index) =>
    createProject(workspaceId, {
      ...seed,
      description: `${seed.name} — demo project.`,
      status: index === 3 ? 'planning' : 'active',
      startDate: toISO(subDays(now, 40 - index * 5)),
      deadline: toISO(subDays(now, -30 + index * 10)),
      order: index,
      milestones: [
        createMilestone({ title: 'Scope agreed', completed: true, order: 0, completedAt: toISO(subDays(now, 25)) }),
        createMilestone({ title: 'First milestone shipped', completed: index < 2, order: 1 }),
        createMilestone({ title: 'Launch', completed: false, order: 2, dueDate: toISO(subDays(now, -21)) }),
      ],
      tags: [pick(TAGS)],
    }),
  )

  /* ---------------------------------------------------------------- goals -- */
  const goals = [
    createGoal(workspaceId, {
      title: 'Ship v1 to 100 users',
      description: 'Get the product in front of real users and iterate on feedback.',
      priority: 'critical',
      deadline: toISO(subDays(now, -60)),
      linkedProjectIds: [projects[0].id],
      color: '#6366f1',
      order: 0,
      milestones: [
        createMilestone({ title: 'Private beta', completed: true, order: 0, completedAt: toISO(subDays(now, 14)) }),
        createMilestone({ title: 'Public launch', completed: false, order: 1 }),
      ],
    }),
    createGoal(workspaceId, {
      title: 'Run a half marathon',
      description: 'Build up to 21km by the end of the season.',
      priority: 'medium',
      deadline: toISO(subDays(now, -120)),
      linkedProjectIds: [projects[1].id],
      color: '#22c55e',
      order: 1,
      milestones: [createMilestone({ title: 'Run 10k without stopping', completed: true, order: 0 })],
    }),
  ]

  /* --------------------------------------------------------------- habits -- */
  const habits = [
    createHabit(workspaceId, { title: 'Deep work block', frequency: 'daily', target: 1, color: '#6366f1', icon: 'brain', order: 0 }),
    createHabit(workspaceId, { title: 'Exercise', frequency: 'daily', target: 1, color: '#22c55e', icon: 'activity', order: 1 }),
    createHabit(workspaceId, { title: 'Read 20 pages', frequency: 'daily', target: 1, color: '#f97316', icon: 'book', order: 2 }),
    createHabit(workspaceId, { title: 'Weekly review', frequency: 'weekly', target: 1, color: '#a855f7', icon: 'check', order: 3 }),
  ]

  /* ---------------------------------------------------------------- tasks -- */
  const tasks: Task[] = []
  const timeEntries: TimeEntry[] = []
  const focusSessions: FocusSession[] = []
  const habitEntries: HabitEntry[] = []

  let titleCursor = 0
  const nextTitle = () => TASK_TITLES[titleCursor++ % TASK_TITLES.length]

  // 30 days of history, then a few days of upcoming work.
  for (let offset = 30; offset >= -4; offset--) {
    const date = subDays(now, offset)
    const day = toDayKey(date)
    const isWeekend = date.getDay() === 0 || date.getDay() === 6
    const isPast = offset > 0
    const isToday = offset === 0

    const count = isWeekend ? Math.floor(rand() * 2) : 2 + Math.floor(rand() * 3)

    for (let i = 0; i < count; i++) {
      const project = rand() < 0.85 ? pick(projects) : null
      const startMinutes = 9 * 60 + i * 90 + Math.floor(rand() * 20)
      const estimated = [25, 30, 45, 60, 90][Math.floor(rand() * 5)]
      const priority = (['critical', 'high', 'medium', 'medium', 'low'] as const)[
        Math.floor(rand() * 5)
      ]

      // Past days complete most work; today is partly done; future is untouched.
      const completed = isPast ? rand() < 0.78 : isToday ? rand() < 0.4 : false
      const actual = completed ? Math.max(5, Math.round(estimated * (0.7 + rand() * 0.8))) : 0
      const completedAt = completed
        ? toISO(dayAtMinutes(day, Math.min(19 * 60, startMinutes + actual)))
        : null

      const hasDeadline = rand() < 0.45
      const task = createTask(workspaceId, {
        title: nextTitle(),
        description: rand() < 0.3 ? 'Captured from the weekly planning session.' : '',
        projectId: project?.id ?? null,
        goalId: project && rand() < 0.4 ? (goals.find((g) => g.linkedProjectIds.includes(project.id))?.id ?? null) : null,
        status: completed ? 'completed' : isPast ? (rand() < 0.5 ? 'planned' : 'in_progress') : 'planned',
        priority,
        tags: rand() < 0.6 ? [pick(TAGS)] : [],
        startDate: toISO(dayAtMinutes(day, startMinutes)),
        dueDate: hasDeadline ? toISO(dayAtMinutes(day, 18 * 60)) : null,
        estimatedDuration: estimated,
        actualDuration: actual,
        completedAt,
        order: i,
        createdAt: toISO(subDays(date, 1 + Math.floor(rand() * 5))),
      })
      tasks.push(task)

      if (actual > 0) {
        const start = dayAtMinutes(day, startMinutes)
        const end = dayAtMinutes(day, startMinutes + actual)
        timeEntries.push({
          id: newId(),
          workspaceId,
          taskId: task.id,
          projectId: task.projectId,
          startTime: toISO(start),
          endTime: toISO(end),
          duration: actual,
          sessionType: 'focus',
          note: '',
          day,
          createdAt: toISO(end),
        })

        // Roughly two thirds of tracked time also counts as a focus session.
        if (rand() < 0.65) {
          focusSessions.push({
            id: newId(),
            workspaceId,
            taskId: task.id,
            projectId: task.projectId,
            startTime: toISO(start),
            endTime: toISO(end),
            duration: actual,
            mode: 'pomodoro',
            pomodoroCycle: 1 + Math.floor(rand() * 4),
            plannedDuration: 25,
            completed: true,
            interruptions: Math.floor(rand() * 3),
            day,
            createdAt: toISO(end),
          })
        }
      }
    }

    // Inbox items with no schedule, so the Inbox view is not empty.
    if (offset % 9 === 0) {
      tasks.push(
        createTask(workspaceId, {
          title: nextTitle(),
          status: 'inbox',
          priority: 'medium',
          startDate: null,
          order: 0,
          createdAt: toISO(date),
        }),
      )
    }

    // Habit history — a believable streak with occasional misses.
    if (isPast || isToday) {
      for (const habit of habits) {
        if (habit.frequency === 'weekly') {
          if (date.getDay() !== 0) continue
          if (rand() > 0.75) continue
        } else if (rand() > 0.8) {
          continue
        }
        habitEntries.push({
          id: newId(),
          workspaceId,
          habitId: habit.id,
          day,
          count: 1,
          note: '',
          createdAt: toISO(dayAtMinutes(day, 20 * 60)),
        })
      }
    }
  }

  // A couple of overdue items so the dashboard's overdue lane is exercised.
  tasks.push(
    createTask(workspaceId, {
      title: 'Submit the quarterly expense report',
      projectId: projects[3].id,
      status: 'planned',
      priority: 'high',
      startDate: toISO(dayAtMinutes(toDayKey(subDays(now, 3)), 10 * 60)),
      dueDate: toISO(dayAtMinutes(toDayKey(subDays(now, 2)), 17 * 60)),
      estimatedDuration: 45,
      tags: ['admin'],
    }),
    createTask(workspaceId, {
      title: 'Reply to the partnership email',
      projectId: projects[0].id,
      status: 'blocked',
      priority: 'critical',
      startDate: null,
      dueDate: toISO(dayAtMinutes(toDayKey(subDays(now, 1)), 12 * 60)),
      estimatedDuration: 20,
    }),
  )

  // Subtasks under the first open parent, so the subtask tree has something in it.
  const parent = tasks.find((t) => t.status !== 'completed' && !t.parentTaskId)
  if (parent) {
    tasks.push(
      createTask(workspaceId, {
        title: 'Collect the requirements',
        parentTaskId: parent.id,
        projectId: parent.projectId,
        status: 'completed',
        priority: 'medium',
        estimatedDuration: 20,
        actualDuration: 25,
        completedAt: toISO(subDays(now, 1)),
        order: 0,
      }),
      createTask(workspaceId, {
        title: 'Draft the outline',
        parentTaskId: parent.id,
        projectId: parent.projectId,
        status: 'in_progress',
        priority: 'medium',
        estimatedDuration: 30,
        order: 1,
      }),
    )
  }

  await db.transaction(
    'rw',
    [db.projects, db.tasks, db.goals, db.habits, db.habitEntries, db.timeEntries, db.focusSessions],
    async () => {
      await db.projects.bulkAdd(projects)
      await db.goals.bulkAdd(goals)
      await db.habits.bulkAdd(habits)
      await db.tasks.bulkAdd(tasks)
      await db.habitEntries.bulkAdd(habitEntries)
      await db.timeEntries.bulkAdd(timeEntries)
      await db.focusSessions.bulkAdd(focusSessions)
    },
  )
}
