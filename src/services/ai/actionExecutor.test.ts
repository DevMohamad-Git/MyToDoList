// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import { executeProposal, rollbackGranular } from './actionExecutor'
import type { AssistantProposal } from '@/types/assistant'

describe('actionExecutor & granular rollback (Requirement #1)', () => {
  const workspaceId = 'test_ws_1'

  beforeEach(async () => {
    await db.tasks.clear()
    await db.projects.clear()
    await db.habits.clear()
    await db.goals.clear()
  })

  it('executes project and task creation and rolls back surgically', async () => {
    const proposal: AssistantProposal = {
      type: 'create_project_tasks',
      assumptions: ['تست فرضیات'],
      project: {
        name: 'پروژه تستی',
        description: 'توضیحات پروژه',
      },
      tasks: [
        {
          title: 'کار شماره ۱',
          priority: 'high',
          estimatedDuration: 45,
          subtasks: [{ title: 'زیرکار ۱-الف', estimatedDuration: 15 }],
        },
        {
          title: 'کار شماره ۲',
          priority: 'medium',
        },
      ],
    }

    // 1. Execute
    const result = await executeProposal(workspaceId, proposal)
    expect(result.success).toBe(true)
    expect(result.createdProjectId).toBeDefined()
    expect(result.createdTaskIds?.length).toBe(3) // 2 tasks + 1 subtask

    // Verify in database
    const savedProjects = await db.projects.toArray()
    const savedTasks = await db.tasks.toArray()
    expect(savedProjects.length).toBe(1)
    expect(savedProjects[0].name).toBe('پروژه تستی')
    expect(savedTasks.length).toBe(3)

    // 2. Granular Rollback (Surgical Undo)
    await rollbackGranular(result.undoLog)

    // Verify everything created by this proposal was deleted
    const projectsAfterRollback = await db.projects.toArray()
    const tasksAfterRollback = await db.tasks.toArray()
    expect(projectsAfterRollback.length).toBe(0)
    expect(tasksAfterRollback.length).toBe(0)
  })

  it('undoes bulk edit by restoring exact previous values', async () => {
    // Insert a task
    const initialTaskId = 'task_initial_1'
    await db.tasks.put({
      id: initialTaskId,
      workspaceId,
      projectId: null,
      parentTaskId: null,
      goalId: null,
      title: 'کار اولیه',
      description: '',
      status: 'inbox',
      priority: 'low',
      tags: [],
      startDate: null,
      dueDate: '2026-11-01T10:00:00.000Z',
      estimatedDuration: 30,
      actualDuration: 0,
      manualProgress: null,
      scoreWeight: 1,
      recurrence: null,
      dependencies: [],
      links: [],
      notes: '',
      order: 1,
      archived: false,
      recurrenceSourceId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
    })

    const editProposal: AssistantProposal = {
      type: 'bulk_edit',
      assumptions: [],
      edits: [
        {
          entityType: 'task',
          id: initialTaskId,
          currentTitle: 'کار اولیه',
          field: 'priority',
          oldValue: 'low',
          newValue: 'critical',
          enabled: true,
        },
      ],
    }

    // Execute edit
    const result = await executeProposal(workspaceId, editProposal)
    expect(result.success).toBe(true)

    const updatedTask = await db.tasks.get(initialTaskId)
    expect(updatedTask?.priority).toBe('critical')

    // Rollback edit
    await rollbackGranular(result.undoLog)

    const restoredTask = await db.tasks.get(initialTaskId)
    expect(restoredTask?.priority).toBe('low')
  })
})
