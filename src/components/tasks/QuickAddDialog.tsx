import { useLiveQuery } from 'dexie-react-hooks'
import { Paperclip, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Field,
  Input,
  JalaliDateTimePicker,
  Modal,
  OptionSelect,
  Textarea,
  toast,
} from '@/components/ui'
import { MAX_INLINE_ATTACHMENT_BYTES, MAX_TASK_ATTACHMENTS_TOTAL_BYTES } from '@/config/constants'
import { priorityLabel, useT } from '@/i18n'
import { attachmentRepo } from '@/storage/attachmentRepo'
import { projectRepo } from '@/storage/projectRepo'
import { taskRepo } from '@/storage/taskRepo'
import { PRIORITIES, type ID, type Priority } from '@/types'
import { useWorkspaceId } from '@/stores/workspace'
import { formatBytes, fromDateTimeInput } from '@/utils/date'
import { newId } from '@/utils/id'

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

/** Extract URLs from text to populate structured TaskLink items. */
export function extractUrls(text: string): { label: string; url: string }[] {
  if (!text) return []
  const urlRegex = /(https?:\/\/[^\s]+)/gi
  const matches = text.match(urlRegex)
  if (!matches) return []
  const unique = Array.from(new Set(matches))
  return unique.map((url) => {
    try {
      const parsed = new URL(url)
      return { label: parsed.hostname.replace(/^www\./, ''), url }
    } catch {
      return { label: url, url }
    }
  })
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
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [priority, setPriority] = useState<Priority>('medium')
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? '')
  const [estimate, setEstimate] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset each time the dialog opens so a stale draft never leaks into the next capture.
  useEffect(() => {
    if (!open) return
    setRaw('')
    setNotes('')
    setFiles([])
    setPriority('medium')
    setProjectId(defaultProjectId ?? '')
    setEstimate('')
    setDue('')
  }, [open, defaultProjectId])

  const parsed = parseQuickAdd(raw)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files ?? [])
    if (selectedFiles.length === 0) return

    const currentTotal = files.reduce((acc, f) => acc + f.size, 0)
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
      setFiles((prev) => [...prev, ...validFiles])
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function submit() {
    if (!parsed.title) return
    setBusy(true)
    try {
      const trimmedNotes = notes.trim()
      const links = extractUrls(trimmedNotes).map((link) => ({
        id: newId(),
        label: link.label,
        url: link.url,
      }))

      const created = await taskRepo.create(workspaceId, {
        title: parsed.title,
        notes: trimmedNotes,
        links,
        tags: parsed.tags,
        priority: parsed.priority ?? priority,
        projectId: projectId || null,
        estimatedDuration: estimate ? Math.max(1, Number(estimate)) : null,
        dueDate: due ? fromDateTimeInput(due) : null,
        startDate: defaultStartDate,
        status: defaultStartDate ? 'planned' : 'inbox',
      })
      toast.success(t('toastTaskAdded'))

      if (files.length > 0) {
        const { errors } = await attachmentRepo.addMany(workspaceId, { taskId: created.id }, files)
        if (errors.length > 0) {
          toast.error(errors.join('\n'))
        }
      }

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
              placeholder="15"
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

        <Field label={t('qaNotes')} htmlFor="qa-notes">
          <Textarea
            id="qa-notes"
            rows={3}
            dir="auto"
            placeholder={t('qaNotesPlaceholder')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault()
                void submit()
              }
            }}
          />
        </Field>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">{t('taskAttachments')}</span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-1.5"
            >
              <Paperclip className="size-3.5" />
              {t('taskAddAttachment')}
            </Button>
          </div>

          {files.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {files.map((file, index) => (
                <span
                  key={`${file.name}-${index}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2 py-1 text-xs text-foreground"
                >
                  <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                  <span className="max-w-44 truncate" title={file.name}>
                    {file.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground" dir="ltr">
                    ({formatBytes(file.size)})
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => removeFile(index)}
                    className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}

