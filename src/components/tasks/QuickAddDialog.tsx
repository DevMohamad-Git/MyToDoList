import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Field, Input, JalaliDateTimePicker, Modal, OptionSelect, toast } from '@/components/ui'
import { priorityLabel, useT } from '@/i18n'
import { projectRepo } from '@/storage/projectRepo'
import { taskRepo } from '@/storage/taskRepo'
import { PRIORITIES, type ID, type Priority } from '@/types'
import { useWorkspaceId } from '@/stores/workspace'
import { fromDateTimeInput } from '@/utils/date'

/**
 * Quick capture.
 *
 * Optimised for getting a thought out of the user's head in one keystroke burst:
 * title is the only required field, everything else is optional, and Enter saves.
 * Lightweight parsing of `#tag` and `!priority` inline keeps hands on the keyboard.
 */

const PRIORITY_TOKENS: Record<string, Priority> = {
  '!1': 'critical',
  '!critical': 'critical',
  '!2': 'high',
  '!high': 'high',
  '!3': 'medium',
  '!medium': 'medium',
  '!4': 'low',
  '!low': 'low',
}

/** Strip `#tag` / `!priority` tokens out of the title and return them separately. */
export function parseQuickAdd(raw: string): { title: string; tags: string[]; priority: Priority | null } {
  const tags: string[] = []
  let priority: Priority | null = null

  const words = raw.split(/\s+/).filter((word) => {
    if (word.startsWith('#') && word.length > 1) {
      tags.push(word.slice(1).toLowerCase())
      return false
    }
    const mapped = PRIORITY_TOKENS[word.toLowerCase()]
    if (mapped) {
      priority = mapped
      return false
    }
    return true
  })

  return { title: words.join(' ').trim(), tags, priority }
}

export function QuickAddDialog({
  open,
  onClose,
  defaultProjectId = null,
  defaultStartDate = null,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  defaultProjectId?: ID | null
  /** Pre-fill the schedule, e.g. when adding from a calendar day. */
  defaultStartDate?: string | null
  onCreated?: (taskId: ID) => void
}) {
  const t = useT()
  const workspaceId = useWorkspaceId()
  const projects = useLiveQuery(() => projectRepo.active(workspaceId), [workspaceId]) ?? []

  const [raw, setRaw] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? '')
  const [estimate, setEstimate] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)

  // Reset each time the dialog opens so a stale draft never leaks into the next capture.
  useEffect(() => {
    if (!open) return
    setRaw('')
    setPriority('medium')
    setProjectId(defaultProjectId ?? '')
    setEstimate('')
    setDue('')
  }, [open, defaultProjectId])

  const parsed = parseQuickAdd(raw)

  async function submit() {
    if (!parsed.title) return
    setBusy(true)
    try {
      const created = await taskRepo.create(workspaceId, {
        title: parsed.title,
        tags: parsed.tags,
        priority: parsed.priority ?? priority,
        projectId: projectId || null,
        estimatedDuration: estimate ? Math.max(1, Number(estimate)) : null,
        dueDate: due ? fromDateTimeInput(due) : null,
        startDate: defaultStartDate,
        status: defaultStartDate ? 'planned' : 'inbox',
      })
      toast.success(t('toastTaskAdded'))
      onCreated?.(created.id)
      onClose()
    } catch (error) {
      toast.error((error as Error).message || t('toastTaskAddFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('shellNewTask')}
      description={t('qaDesc')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('cCancel')}
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !parsed.title}>
            <Plus className="size-4" />
            {t('qaSubmit')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          autoFocus
          placeholder={t('qaPlaceholder')}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />

        {parsed.tags.length > 0 || parsed.priority ? (
          <p className="text-xs text-muted-foreground">
            {t('qaDetected')}{' '}
            {parsed.priority ? <span className="font-medium">{priorityLabel(parsed.priority)}</span> : null}
            {parsed.priority && parsed.tags.length ? ' · ' : ''}
            {parsed.tags.map((tag) => `#${tag}`).join(' ')}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('qaPriority')} htmlFor="qa-priority">
            <OptionSelect
              id="qa-priority"
              value={parsed.priority ?? priority}
              disabled={Boolean(parsed.priority)}
              onChange={setPriority}
              options={PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) }))}
            />
          </Field>

          <Field label={t('qaProject')} htmlFor="qa-project">
            <OptionSelect
              id="qa-project"
              value={projectId}
              placeholder={t('qaNoProject')}
              onChange={setProjectId}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>

          <Field label={t('qaEstimate')} htmlFor="qa-estimate">
            <Input
              id="qa-estimate"
              type="number"
              min={1}
              placeholder="45"
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
            />
          </Field>

          <Field label={t('qaDue')} htmlFor="qa-due">
            <JalaliDateTimePicker
              id="qa-due"
              value={due}
              onChange={(v) => setDue(v)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
