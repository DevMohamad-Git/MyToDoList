import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Checkbox,
  Field,
  IconButton,
  Input,
  Modal,
  OptionSelect,
  Select,
  Slider,
  Tabs,
  Textarea,
  toast,
} from '@/components/ui'
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from '@/config/constants'
import { createRecurrence } from '@/database/factories'
import { describeRecurrence, upcomingOccurrences } from '@/services/recurrence'
import { goalRepo } from '@/storage/goalRepo'
import { projectRepo } from '@/storage/projectRepo'
import { taskRepo } from '@/storage/taskRepo'
import { timeRepo } from '@/storage/timeRepo'
import { useWorkspaceId } from '@/stores/workspace'
import type {
  ID,
  Priority,
  Recurrence,
  RecurrenceFrequency,
  Task,
  TaskLink,
  TaskStatus,
  WeekDay,
} from '@/types'
import { PRIORITIES, TASK_STATUSES } from '@/types'
import {
  formatDate,
  formatDuration,
  fromDateInput,
  fromDateTimeInput,
  toDateInput,
  toDateTimeInput,
} from '@/utils/date'
import { newId } from '@/utils/id'

/**
 * Full task editor.
 *
 * Split into tabs because a task carries far more than fits one comfortable form,
 * and the vast majority of edits only touch the first tab. Nothing is written until
 * Save, so an abandoned edit leaves the record untouched.
 */

type Tab = 'details' | 'schedule' | 'links' | 'time'

const RECURRENCE_FREQUENCIES: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

const WEEKDAY_LABELS: { value: WeekDay; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

export function TaskEditorModal({
  taskId,
  open,
  onClose,
}: {
  taskId: ID | null
  open: boolean
  onClose: () => void
}) {
  const workspaceId = useWorkspaceId()
  const task = useLiveQuery(() => (taskId ? taskRepo.get(taskId) : undefined), [taskId])
  const projects = useLiveQuery(() => projectRepo.list(workspaceId), [workspaceId]) ?? []
  const goals = useLiveQuery(() => goalRepo.list(workspaceId), [workspaceId]) ?? []
  const subtasks =
    useLiveQuery(() => (taskId ? taskRepo.subtasks(workspaceId, taskId) : []), [workspaceId, taskId]) ?? []
  const timeEntries =
    useLiveQuery(() => (taskId ? timeRepo.forTask(taskId) : []), [taskId]) ?? []
  const siblings =
    useLiveQuery(
      () => taskRepo.list(workspaceId, { status: ['inbox', 'planned', 'in_progress', 'blocked'] }),
      [workspaceId],
    ) ?? []

  const [tab, setTab] = useState<Tab>('details')
  const [draft, setDraft] = useState<Task | null>(null)
  const [busy, setBusy] = useState(false)
  const [newSubtask, setNewSubtask] = useState('')

  // Load the record into a local draft whenever the dialog targets a new task.
  useEffect(() => {
    if (open && task) setDraft({ ...task })
    if (!open) {
      setDraft(null)
      setTab('details')
      setNewSubtask('')
    }
  }, [open, task])

  const dependencyOptions = useMemo(
    () => siblings.filter((t) => t.id !== taskId).map((t) => ({ value: t.id, label: t.title })),
    [siblings, taskId],
  )

  if (!open) return null

  if (!draft) {
    return (
      <Modal open={open} onClose={onClose} title="Task">
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      </Modal>
    )
  }

  const patch = <K extends keyof Task>(key: K, value: Task[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current))

  const patchRecurrence = (value: Partial<Recurrence>) =>
    setDraft((current) =>
      current
        ? { ...current, recurrence: { ...(current.recurrence ?? createRecurrence()), ...value } }
        : current,
    )

  // `draft` is passed in rather than closed over: TypeScript does not carry the
  // null-narrowing above into nested function bodies.
  async function save(current: Task) {
    if (!current.title.trim()) {
      toast.error('A task needs a title')
      return
    }
    setBusy(true)
    try {
      await taskRepo.update(current.id, {
        title: current.title.trim(),
        description: current.description,
        status: current.status,
        priority: current.priority,
        projectId: current.projectId,
        goalId: current.goalId,
        tags: current.tags,
        startDate: current.startDate,
        dueDate: current.dueDate,
        estimatedDuration: current.estimatedDuration,
        manualProgress: current.manualProgress,
        scoreWeight: current.scoreWeight,
        recurrence: current.recurrence,
        dependencies: current.dependencies,
        links: current.links,
        notes: current.notes,
      })
      toast.success('Task saved')
      onClose()
    } catch (error) {
      toast.error((error as Error).message || 'Could not save the task')
    } finally {
      setBusy(false)
    }
  }

  async function addSubtask(current: Task) {
    const title = newSubtask.trim()
    if (!title || !taskId) return
    await taskRepo.create(workspaceId, {
      title,
      parentTaskId: taskId,
      projectId: current.projectId,
      status: 'planned',
      priority: current.priority,
    })
    setNewSubtask('')
  }

  const tagsValue = draft.tags.join(', ')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={draft.title || 'Task'}
      description={`Created ${formatDate(draft.createdAt)}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save(draft)} disabled={busy}>
            Save changes
          </Button>
        </>
      }
    >
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'details', label: 'Details' },
          { value: 'schedule', label: 'Schedule' },
          { value: 'links', label: 'Subtasks & links', count: subtasks.length || undefined },
          { value: 'time', label: 'Time', count: timeEntries.length || undefined },
        ]}
      />

      {tab === 'details' ? (
        <div className="flex flex-col gap-3">
          <Field label="Title" required htmlFor="te-title">
            <Input
              id="te-title"
              value={draft.title}
              onChange={(e) => patch('title', e.target.value)}
            />
          </Field>

          <Field label="Description" htmlFor="te-desc">
            <Textarea
              id="te-desc"
              value={draft.description}
              onChange={(e) => patch('description', e.target.value)}
              placeholder="What does done look like?"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status" htmlFor="te-status">
              <OptionSelect<TaskStatus>
                id="te-status"
                value={draft.status}
                onChange={(v) => patch('status', v)}
                options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }))}
              />
            </Field>

            <Field label="Priority" htmlFor="te-priority">
              <OptionSelect<Priority>
                id="te-priority"
                value={draft.priority}
                onChange={(v) => patch('priority', v)}
                options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
              />
            </Field>

            <Field label="Project" htmlFor="te-project">
              <OptionSelect
                id="te-project"
                value={draft.projectId ?? ''}
                placeholder="No project"
                onChange={(v) => patch('projectId', v || null)}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>

            <Field label="Goal" htmlFor="te-goal">
              <OptionSelect
                id="te-goal"
                value={draft.goalId ?? ''}
                placeholder="No goal"
                onChange={(v) => patch('goalId', v || null)}
                options={goals.map((g) => ({ value: g.id, label: g.title }))}
              />
            </Field>
          </div>

          <Field label="Tags" hint="Comma separated" htmlFor="te-tags">
            <Input
              id="te-tags"
              value={tagsValue}
              onChange={(e) =>
                patch(
                  'tags',
                  e.target.value
                    .split(',')
                    .map((t) => t.trim().toLowerCase())
                    .filter(Boolean),
                )
              }
              placeholder="deep-work, writing"
            />
          </Field>

          <Slider
            label="Score weight"
            suffix="×"
            min={0.25}
            max={4}
            step={0.25}
            value={draft.scoreWeight}
            onChange={(v) => patch('scoreWeight', v)}
          />
          <p className="-mt-1 text-xs text-muted-foreground">
            Multiplies this task's contribution to the priority-weighted score component.
          </p>

          <Field label="Notes" htmlFor="te-notes">
            <Textarea
              id="te-notes"
              value={draft.notes}
              onChange={(e) => patch('notes', e.target.value)}
              placeholder="Working notes, links, context…"
            />
          </Field>
        </div>
      ) : null}

      {tab === 'schedule' ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Scheduled start" hint="Presence of a start makes it planned" htmlFor="te-start">
              <Input
                id="te-start"
                type="datetime-local"
                value={toDateTimeInput(draft.startDate)}
                onChange={(e) => patch('startDate', fromDateTimeInput(e.target.value))}
              />
            </Field>

            <Field label="Due" htmlFor="te-due">
              <Input
                id="te-due"
                type="datetime-local"
                value={toDateTimeInput(draft.dueDate)}
                onChange={(e) => patch('dueDate', fromDateTimeInput(e.target.value))}
              />
            </Field>

            <Field label="Estimate (minutes)" htmlFor="te-est">
              <Input
                id="te-est"
                type="number"
                min={1}
                value={draft.estimatedDuration ?? ''}
                onChange={(e) =>
                  patch('estimatedDuration', e.target.value ? Math.max(1, Number(e.target.value)) : null)
                }
              />
            </Field>

            <Field label="Manual progress" hint="Leave empty to derive from subtasks" htmlFor="te-progress">
              <Input
                id="te-progress"
                type="number"
                min={0}
                max={100}
                value={draft.manualProgress ?? ''}
                onChange={(e) =>
                  patch('manualProgress', e.target.value === '' ? null : Number(e.target.value))
                }
              />
            </Field>
          </div>

          <div className="rounded-lg border border-border p-3">
            <Checkbox
              label="Repeats"
              checked={Boolean(draft.recurrence)}
              onChange={(e) => patch('recurrence', e.target.checked ? createRecurrence() : null)}
            />

            {draft.recurrence ? (
              <div className="mt-3 flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Frequency">
                    <OptionSelect<RecurrenceFrequency>
                      value={draft.recurrence.frequency}
                      onChange={(v) => patchRecurrence({ frequency: v })}
                      options={RECURRENCE_FREQUENCIES}
                    />
                  </Field>
                  <Field label="Every">
                    <Input
                      type="number"
                      min={1}
                      value={draft.recurrence.interval}
                      onChange={(e) =>
                        patchRecurrence({ interval: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                  </Field>
                </div>

                {draft.recurrence.frequency === 'weekly' ? (
                  <Field label="On days">
                    <div className="flex flex-wrap gap-1">
                      {WEEKDAY_LABELS.map((day) => {
                        const active = draft.recurrence!.weekDays.includes(day.value)
                        return (
                          <Button
                            key={day.value}
                            size="sm"
                            variant={active ? 'primary' : 'outline'}
                            onClick={() =>
                              patchRecurrence({
                                weekDays: active
                                  ? draft.recurrence!.weekDays.filter((d) => d !== day.value)
                                  : [...draft.recurrence!.weekDays, day.value],
                              })
                            }
                          >
                            {day.label}
                          </Button>
                        )
                      })}
                    </div>
                  </Field>
                ) : null}

                {draft.recurrence.frequency === 'monthly' ? (
                  <Field label="Day of month" hint="Leave empty to use the due date's day">
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={draft.recurrence.monthDay ?? ''}
                      onChange={(e) =>
                        patchRecurrence({
                          monthDay: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Until">
                    <Input
                      type="date"
                      value={toDateInput(draft.recurrence.until)}
                      onChange={(e) => patchRecurrence({ until: fromDateInput(e.target.value) })}
                    />
                  </Field>
                  <Field label="Max occurrences">
                    <Input
                      type="number"
                      min={1}
                      value={draft.recurrence.count ?? ''}
                      onChange={(e) =>
                        patchRecurrence({ count: e.target.value === '' ? null : Number(e.target.value) })
                      }
                    />
                  </Field>
                </div>

                <p className="text-xs text-muted-foreground">
                  {describeRecurrence(draft.recurrence)}. Next:{' '}
                  {upcomingOccurrences(draft.recurrence, new Date(), 3)
                    .map((d) => formatDate(d))
                    .join(', ') || '—'}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'links' ? (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Subtasks</h3>
            <div className="rounded-lg border border-border">
              {subtasks.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">No subtasks yet.</p>
              ) : (
                subtasks
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        aria-label={`Complete ${sub.title}`}
                        checked={sub.status === 'completed'}
                        onChange={() => void taskRepo.toggleComplete(sub.id)}
                        className="size-3.5 shrink-0 cursor-pointer rounded border-input accent-[var(--color-accent)]"
                      />
                      <span
                        className={
                          sub.status === 'completed'
                            ? 'min-w-0 flex-1 truncate text-sm text-muted-foreground line-through'
                            : 'min-w-0 flex-1 truncate text-sm'
                        }
                      >
                        {sub.title}
                      </span>
                      <IconButton
                        label={`Delete ${sub.title}`}
                        onClick={() => void taskRepo.remove(sub.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </div>
                  ))
              )}
              <div className="flex items-center gap-2 border-t border-border p-2">
                <Input
                  placeholder="Add a subtask…"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void addSubtask(draft)
                  }}
                />
                <Button size="sm" onClick={() => void addSubtask(draft)} disabled={!newSubtask.trim()}>
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
              Depends on
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {draft.dependencies.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nothing blocks this task. The auto-scheduler skips tasks with open dependencies.
                </p>
              ) : (
                draft.dependencies.map((id) => {
                  const dep = siblings.find((t) => t.id === id)
                  return (
                    <Badge key={id} className="gap-1 pr-1">
                      {dep?.title ?? 'Unknown task'}
                      <button
                        type="button"
                        aria-label="Remove dependency"
                        onClick={() =>
                          patch('dependencies', draft.dependencies.filter((d) => d !== id))
                        }
                        className="rounded p-0.5 hover:bg-muted"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  )
                })
              )}
            </div>
            <Select
              className="mt-2"
              value=""
              onChange={(e) => {
                const value = e.target.value
                if (value && !draft.dependencies.includes(value)) {
                  patch('dependencies', [...draft.dependencies, value])
                }
              }}
            >
              <option value="">Add a dependency…</option>
              {dependencyOptions
                .filter((o) => !draft.dependencies.includes(o.value))
                .map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
            </Select>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Links</h3>
            {draft.links.map((link, index) => (
              <div key={link.id} className="mb-1.5 flex items-center gap-2">
                <Input
                  placeholder="Label"
                  className="max-w-40"
                  value={link.label}
                  onChange={(e) => {
                    const next = [...draft.links]
                    next[index] = { ...link, label: e.target.value }
                    patch('links', next)
                  }}
                />
                <Input
                  placeholder="https://…"
                  value={link.url}
                  onChange={(e) => {
                    const next = [...draft.links]
                    next[index] = { ...link, url: e.target.value }
                    patch('links', next)
                  }}
                />
                <IconButton
                  label="Remove link"
                  onClick={() => patch('links', draft.links.filter((l) => l.id !== link.id))}
                >
                  <Trash2 className="size-3.5" />
                </IconButton>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                patch('links', [...draft.links, { id: newId(), label: '', url: '' } as TaskLink])
              }
            >
              <Plus className="size-3.5" />
              Add link
            </Button>
          </div>
        </div>
      ) : null}

      {tab === 'time' ? (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">Time entries</h3>
            <span className="text-xs text-muted-foreground">
              Total {formatDuration(draft.actualDuration)}
              {draft.estimatedDuration
                ? ` of ${formatDuration(draft.estimatedDuration)} estimated`
                : ''}
            </span>
          </div>

          <div className="rounded-lg border border-border">
            {timeEntries.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                No time logged. Start a focus session from the task menu, or log time on the Focus page.
              </p>
            ) : (
              timeEntries
                .slice()
                .sort((a, b) => b.startTime.localeCompare(a.startTime))
                .map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0"
                  >
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">
                      {formatDate(entry.startTime, 'd MMM')}
                    </span>
                    <span className="w-16 shrink-0 tabular-nums">{formatDuration(entry.duration)}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {entry.note || entry.sessionType}
                    </span>
                    <IconButton
                      label="Delete time entry"
                      onClick={async () => {
                        await timeRepo.remove(entry.id)
                        toast.success('Time entry removed')
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                ))
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
