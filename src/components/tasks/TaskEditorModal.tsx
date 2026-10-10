import { useLiveQuery } from 'dexie-react-hooks'
import { Download, ExternalLink, Paperclip, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge,
  Button,
  Checkbox,
  Field,
  IconButton,
  Input,
  JalaliDatePicker,
  JalaliDateTimePicker,
  Modal,
  OptionSelect,
  Select,
  Slider,
  Tabs,
  Textarea,
  toast,
} from '@/components/ui'
import { MAX_INLINE_ATTACHMENT_BYTES, MAX_TASK_ATTACHMENTS_TOTAL_BYTES } from '@/config/constants'
import { createRecurrence } from '@/database/factories'
import { priorityLabel, taskStatusLabel, useI18n, useT } from '@/i18n'
import { describeRecurrence, upcomingOccurrences } from '@/services/recurrence'
import { attachmentRepo } from '@/storage/attachmentRepo'
import { goalRepo } from '@/storage/goalRepo'
import { projectRepo } from '@/storage/projectRepo'
import { taskRepo } from '@/storage/taskRepo'
import { timeRepo } from '@/storage/timeRepo'
import { useWorkspaceId } from '@/stores/workspace'
import type {
  Attachment,
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
  formatBytes,
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

type Tab = 'details' | 'schedule' | 'links' | 'attachments' | 'time'

export function TaskEditorModal({
  taskId,
  open,
  onClose,
}: {
  taskId: ID | null
  open: boolean
  onClose: () => void
}) {
  const t = useT()
  const language = useI18n((s) => s.language)
  const workspaceId = useWorkspaceId()
  const task = useLiveQuery(() => (taskId ? taskRepo.get(taskId) : undefined), [taskId])
  const projects = useLiveQuery(() => projectRepo.list(workspaceId), [workspaceId]) ?? []
  const goals = useLiveQuery(() => goalRepo.list(workspaceId), [workspaceId]) ?? []
  const subtasks =
    useLiveQuery(() => (taskId ? taskRepo.subtasks(workspaceId, taskId) : []), [workspaceId, taskId]) ?? []
  const timeEntries =
    useLiveQuery(() => (taskId ? timeRepo.forTask(taskId) : []), [taskId]) ?? []
  const attachments =
    useLiveQuery(() => (taskId ? attachmentRepo.forTask(taskId) : []), [taskId]) ?? []
  const siblings =
    useLiveQuery(
      () => taskRepo.list(workspaceId, { status: ['inbox', 'planned', 'in_progress', 'blocked'] }),
      [workspaceId],
    ) ?? []

  const [tab, setTab] = useState<Tab>('details')
  const [draft, setDraft] = useState<Task | null>(null)
  const [busy, setBusy] = useState(false)
  const [newSubtask, setNewSubtask] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const recurrenceFrequencies: { value: RecurrenceFrequency; label: string }[] = useMemo(
    () => [
      { value: 'daily', label: t('teFreqDaily') },
      { value: 'weekly', label: t('teFreqWeekly') },
      { value: 'monthly', label: t('teFreqMonthly') },
      { value: 'yearly', label: t('teFreqYearly') },
    ],
    [t],
  )

  const weekdayLabels: { value: WeekDay; label: string }[] = useMemo(
    () =>
      language === 'fa'
        ? [
            { value: 6, label: 'ش' },
            { value: 0, label: 'ی' },
            { value: 1, label: 'د' },
            { value: 2, label: 'س' },
            { value: 3, label: 'چ' },
            { value: 4, label: 'پ' },
            { value: 5, label: 'ج' },
          ]
        : [
            { value: 1, label: 'Mon' },
            { value: 2, label: 'Tue' },
            { value: 3, label: 'Wed' },
            { value: 4, label: 'Thu' },
            { value: 5, label: 'Fri' },
            { value: 6, label: 'Sat' },
            { value: 0, label: 'Sun' },
          ],
    [language],
  )

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
      <Modal open={open} onClose={onClose} title={t('teTask')}>
        <p className="py-6 text-center text-sm text-muted-foreground">{t('teLoading')}</p>
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
      toast.error(t('toastNeedsTitle'))
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
      toast.success(t('toastTaskSaved'))
      onClose()
    } catch (error) {
      toast.error((error as Error).message || t('toastTaskSaveFailed'))
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

  async function openAttachment(att: Attachment) {
    const res = await attachmentRepo.previewUrl(att)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    const win = window.open(res.url, '_blank')
    if (!win) {
      toast.error(t('toastPopupBlocked'))
    }
    setTimeout(() => {
      URL.revokeObjectURL(res.url)
    }, 60_000)
  }

  async function downloadAttachment(att: Attachment) {
    const res = await attachmentRepo.previewUrl(att)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    const a = document.createElement('a')
    a.href = res.url
    a.download = att.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(res.url)
  }

  async function deleteAttachment(att: Attachment) {
    const res = await attachmentRepo.remove(att.id)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(t('toastAttachmentDeleted'))
  }

  async function handleUploadFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files ?? [])
    if (selectedFiles.length === 0 || !taskId) return

    const currentTotal = attachments.reduce((acc, a) => acc + a.size, 0)
    let runningTotal = currentTotal
    const validFiles: File[] = []

    for (const file of selectedFiles) {
      if (file.size > MAX_INLINE_ATTACHMENT_BYTES) {
        toast.error(
          t('errFileTooLarge', {
            name: file.name,
            max: formatBytes(MAX_INLINE_ATTACHMENT_BYTES),
          }),
        )
        continue
      }
      if (runningTotal + file.size > MAX_TASK_ATTACHMENTS_TOTAL_BYTES) {
        toast.error(
          t('errTaskAttachmentsCap', {
            max: formatBytes(MAX_TASK_ATTACHMENTS_TOTAL_BYTES),
          }),
        )
        break
      }
      runningTotal += file.size
      validFiles.push(file)
    }

    if (validFiles.length > 0) {
      const { errors } = await attachmentRepo.addMany(workspaceId, { taskId }, validFiles)
      if (errors.length > 0) {
        toast.error(errors.join('\n'))
      } else {
        toast.success(t('toastAttachmentAdded'))
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const tagsValue = draft.tags.join(', ')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={draft.title || t('teTask')}
      description={t('teCreated', { date: formatDate(draft.createdAt) })}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('cCancel')}
          </Button>
          <Button variant="primary" onClick={() => void save(draft)} disabled={busy}>
            {t('teSaveChanges')}
          </Button>
        </>
      }
    >
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'details', label: t('teTabDetails') },
          { value: 'schedule', label: t('teTabSchedule') },
          { value: 'links', label: t('teTabLinks'), count: subtasks.length || undefined },
          { value: 'attachments', label: t('taskAttachments'), count: attachments.length || undefined },
          { value: 'time', label: t('teTabTime'), count: timeEntries.length || undefined },
        ]}
      />

      {tab === 'details' ? (
        <div className="flex flex-col gap-3">
          <Field label={t('teTitle')} required htmlFor="te-title">
            <Input
              id="te-title"
              value={draft.title}
              onChange={(e) => patch('title', e.target.value)}
            />
          </Field>

          <Field label={t('teDescription')} htmlFor="te-desc">
            <Textarea
              id="te-desc"
              value={draft.description}
              onChange={(e) => patch('description', e.target.value)}
              placeholder={t('teDescPlaceholder')}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('teStatus')} htmlFor="te-status">
              <OptionSelect<TaskStatus>
                id="te-status"
                value={draft.status}
                onChange={(v) => patch('status', v)}
                options={TASK_STATUSES.map((s) => ({ value: s, label: taskStatusLabel(s) }))}
              />
            </Field>

            <Field label={t('qaPriority')} htmlFor="te-priority">
              <OptionSelect<Priority>
                id="te-priority"
                value={draft.priority}
                onChange={(v) => patch('priority', v)}
                options={PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) }))}
              />
            </Field>

            <Field label={t('qaProject')} htmlFor="te-project">
              <OptionSelect
                id="te-project"
                value={draft.projectId ?? ''}
                placeholder={t('qaNoProject')}
                onChange={(v) => patch('projectId', v || null)}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>

            <Field label={t('teGoal')} htmlFor="te-goal">
              <OptionSelect
                id="te-goal"
                value={draft.goalId ?? ''}
                placeholder={t('teNoGoal')}
                onChange={(v) => patch('goalId', v || null)}
                options={goals.map((g) => ({ value: g.id, label: g.title }))}
              />
            </Field>
          </div>

          <Field label={t('teTags')} hint={t('teTagsHint')} htmlFor="te-tags">
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
              placeholder={t('teTagsPlaceholder')}
            />
          </Field>

          <Slider
            label={t('teScoreWeight')}
            suffix="×"
            min={0.25}
            max={4}
            step={0.25}
            value={draft.scoreWeight}
            onChange={(v) => patch('scoreWeight', v)}
          />
          <p className="-mt-1 text-xs text-muted-foreground">
            {t('teScoreWeightDesc')}
          </p>

          <Field label={t('teNotes')} htmlFor="te-notes">
            <Textarea
              id="te-notes"
              value={draft.notes}
              onChange={(e) => patch('notes', e.target.value)}
              placeholder={t('teNotesPlaceholder')}
            />
          </Field>
        </div>
      ) : null}

      {tab === 'schedule' ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('teScheduledStart')} hint={t('teStartHint')} htmlFor="te-start">
              <JalaliDateTimePicker
                id="te-start"
                value={toDateTimeInput(draft.startDate)}
                onChange={(v) => patch('startDate', fromDateTimeInput(v))}
              />
            </Field>

            <Field label={t('qaDue')} htmlFor="te-due">
              <JalaliDateTimePicker
                id="te-due"
                value={toDateTimeInput(draft.dueDate)}
                onChange={(v) => patch('dueDate', fromDateTimeInput(v))}
              />
            </Field>

            <Field label={t('qaEstimate')} htmlFor="te-est">
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

            <Field label={t('teManualProgress')} hint={t('teProgressHint')} htmlFor="te-progress">
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
              label={t('teRepeats')}
              checked={Boolean(draft.recurrence)}
              onChange={(e) => patch('recurrence', e.target.checked ? createRecurrence() : null)}
            />

            {draft.recurrence ? (
              <div className="mt-3 flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('teFrequency')}>
                    <OptionSelect<RecurrenceFrequency>
                      value={draft.recurrence.frequency}
                      onChange={(v) => patchRecurrence({ frequency: v })}
                      options={recurrenceFrequencies}
                    />
                  </Field>
                  <Field label={t('teEvery')}>
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
                  <Field label={t('teOnDays')}>
                    <div className="flex flex-wrap gap-1">
                      {weekdayLabels.map((day) => {
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
                  <Field label={t('teDayOfMonth')} hint={t('teDayOfMonthHint')}>
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
                  <Field label={t('teUntil')}>
                    <JalaliDatePicker
                      value={toDateInput(draft.recurrence.until)}
                      onChange={(v) => patchRecurrence({ until: fromDateInput(v) })}
                    />
                  </Field>
                  <Field label={t('teMaxOccurrences')}>
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
                  {t('teRecurrenceNext', {
                    recurrence: describeRecurrence(draft.recurrence),
                    next: upcomingOccurrences(draft.recurrence, new Date(), 3)
                      .map((d) => formatDate(d))
                      .join(', ') || '—',
                  })}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'links' ? (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">{t('teSubtasks')}</h3>
            <div className="rounded-lg border border-border">
              {subtasks.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">{t('teNoSubtasks')}</p>
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
                  placeholder={t('teAddSubtaskPlaceholder')}
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void addSubtask(draft)
                  }}
                />
                <Button size="sm" onClick={() => void addSubtask(draft)} disabled={!newSubtask.trim()}>
                  <Plus className="size-3.5" />
                  {t('teAddSubtask')}
                </Button>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
              {t('teDependsOn')}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {draft.dependencies.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('teNoDepsHint')}
                </p>
              ) : (
                draft.dependencies.map((id) => {
                  const dep = siblings.find((t) => t.id === id)
                  return (
                    <Badge key={id} className="gap-1 pr-1">
                      {dep?.title ?? t('teUnknownTask')}
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
              <option value="">{t('teAddDependencyPlaceholder')}</option>
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
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">{t('teLinks')}</h3>
            {draft.links.map((link, index) => (
              <div key={link.id} className="mb-1.5 flex items-center gap-2">
                <Input
                  placeholder={t('teLinkLabel')}
                  className="max-w-40"
                  value={link.label}
                  onChange={(e) => {
                    const next = [...draft.links]
                    next[index] = { ...link, label: e.target.value }
                    patch('links', next)
                  }}
                />
                <Input
                  placeholder={t('teLinkUrl')}
                  value={link.url}
                  onChange={(e) => {
                    const next = [...draft.links]
                    next[index] = { ...link, url: e.target.value }
                    patch('links', next)
                  }}
                />
                {link.url ? (
                  <a
                    href={link.url.startsWith('http') ? link.url : `https://${link.url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-input text-muted-foreground hover:bg-muted hover:text-accent transition-colors"
                    title={link.url}
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
                <IconButton
                  label={t('teRemoveLink')}
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
              {t('teAddLink')}
            </Button>
          </div>
        </div>
      ) : null}

      {tab === 'attachments' ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase">
                {t('taskAttachments')}
              </h3>
              <p className="text-[11px] text-muted-foreground" dir="ltr">
                {formatBytes(attachments.reduce((acc, a) => acc + a.size, 0))} / {formatBytes(MAX_TASK_ATTACHMENTS_TOTAL_BYTES)}
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleUploadFiles}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5"
              >
                <Paperclip className="size-3.5" />
                {t('taskAddAttachment')}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border">
            {attachments.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t('teNoAttachments')}
              </p>
            ) : (
              attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 border-b border-border px-3 py-2.5 last:border-b-0"
                >
                  <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground" title={att.filename}>
                      {att.filename}
                    </p>
                    <p className="text-[11px] text-muted-foreground" dir="ltr">
                      {formatBytes(att.size)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <IconButton
                      label={t('taskOpenAttachment')}
                      onClick={() => void openAttachment(att)}
                    >
                      <ExternalLink className="size-3.5" />
                    </IconButton>
                    <IconButton
                      label={t('taskDownloadAttachment')}
                      onClick={() => void downloadAttachment(att)}
                    >
                      <Download className="size-3.5" />
                    </IconButton>
                    <IconButton
                      label={t('cDelete')}
                      className="hover:text-rose-400"
                      onClick={() => void deleteAttachment(att)}
                    >
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {tab === 'time' ? (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">{t('teTimeEntries')}</h3>
            <span className="text-xs text-muted-foreground">
              {draft.estimatedDuration
                ? t('teTotalOfEst', {
                    total: formatDuration(draft.actualDuration),
                    estimated: formatDuration(draft.estimatedDuration),
                  })
                : t('teTotalOnly', {
                    total: formatDuration(draft.actualDuration),
                  })}
            </span>
          </div>

          <div className="rounded-lg border border-border">
            {timeEntries.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                {t('teNoTimeLogged')}
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
                      label={t('teDeleteTimeEntry')}
                      onClick={async () => {
                        await timeRepo.remove(entry.id)
                        toast.success(t('toastTimeEntryRemoved'))
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
