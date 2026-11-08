import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar,
  Check,
  Clock,
  ExternalLink,
  FolderKanban,
  Info,
  ListTodo,
  Pencil,
  RotateCcw,
  Sparkles,
  Tag,
  Undo2,
  X,
} from 'lucide-react'
import { Badge, Button, Card, CardBody, Input } from '@/components/ui'
import type { AssistantProposal } from '@/types/assistant'
import type { ID } from '@/types'
import { formatDuration } from '@/utils/date'
import { formatJalali } from '@/utils/jalali'
import { cn } from '@/utils/cn'

interface TreePreviewCardProps {
  proposal: AssistantProposal
  actionStatus?: 'pending' | 'executed' | 'cancelled' | 'undone'
  createdProjectId?: ID
  onConfirm: (modifiedProposal: AssistantProposal) => void
  onRollback: () => void
  onCancel: () => void
  onRequestChanges: () => void
  isProcessing?: boolean
}

const PRIORITY_CLASS: Record<string, string> = {
  critical: 'border-rose-500/30 bg-rose-500/10 text-rose-500',
  high: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
  medium: 'border-accent/30 bg-accent/10 text-accent',
  low: 'border-border bg-muted/50 text-muted-foreground',
}

const PRIORITY_LABEL: Record<string, string> = {
  critical: 'بحرانی',
  high: 'بالا',
  medium: 'متوسط',
  low: 'پایین',
}

export function TreePreviewCard({
  proposal,
  actionStatus = 'pending',
  createdProjectId,
  onConfirm,
  onRollback,
  onCancel,
  onRequestChanges,
  isProcessing = false,
}: TreePreviewCardProps) {
  const [currentProposal, setCurrentProposal] = useState<AssistantProposal>({ ...proposal })
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  const tasks = currentProposal.tasks || []

  const handleToggleTask = (taskIndex: number) => {
    if (actionStatus !== 'pending') return
    const updated = tasks.map((t, i) => (i === taskIndex ? { ...t, enabled: t.enabled === false ? true : false } : t))
    setCurrentProposal({ ...currentProposal, tasks: updated })
  }

  const handleStartEdit = (taskIndex: number, title: string) => {
    if (actionStatus !== 'pending') return
    setEditingTaskId(taskIndex)
    setEditingTitle(title)
  }

  const handleSaveEdit = (taskIndex: number) => {
    if (!editingTitle.trim()) return
    const updated = tasks.map((t, i) => (i === taskIndex ? { ...t, title: editingTitle.trim() } : t))
    setCurrentProposal({ ...currentProposal, tasks: updated })
    setEditingTaskId(null)
  }

  const activeTasksCount = tasks.filter((t) => t.enabled !== false).length

  return (
    <Card className="my-2 border-border/80 bg-card shadow-sm">
      <CardBody className="p-3.5 sm:p-4">
        {/* Status header if already executed/undone/cancelled */}
        {actionStatus === 'executed' ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-500/10 p-2.5 text-xs font-semibold text-emerald-500">
            <div className="flex items-center gap-1.5">
              <Check className="size-4" />
              <span>پیشنهاد با موفقیت در فضای کاری ساخته شد.</span>
            </div>
            <div className="flex items-center gap-2">
              {createdProjectId ? (
                <Link to={`/projects/${createdProjectId}`}>
                  <Button size="sm" variant="secondary" className="h-7 text-xs">
                    <FolderKanban className="size-3.5" />
                    <span>مشاهده پروژه</span>
                  </Button>
                </Link>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                onClick={onRollback}
                disabled={isProcessing}
              >
                <Undo2 className="size-3.5" />
                <span>واگردانی ساخت</span>
              </Button>
            </div>
          </div>
        ) : actionStatus === 'undone' ? (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
            <RotateCcw className="size-4" />
            <span>آیتم‌های ساخته‌شده توسط این پیشنهاد با موفقیت واگردانی (حذف) شدند.</span>
          </div>
        ) : actionStatus === 'cancelled' ? (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
            <X className="size-4" />
            <span>پیشنهاد لغو شد.</span>
          </div>
        ) : null}

        {/* Assumptions banner */}
        {currentProposal.assumptions && currentProposal.assumptions.length > 0 ? (
          <div className="mb-3 rounded-lg border border-accent/20 bg-accent/5 p-2.5 text-xs text-accent">
            <div className="flex items-center gap-1.5 font-semibold">
              <Info className="size-3.5" />
              <span>فرضیات در نظر گرفته شده:</span>
            </div>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted-foreground">
              {currentProposal.assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Project info */}
        {currentProposal.project ? (
          <div className="mb-3 flex items-center gap-2.5 rounded-lg bg-muted/30 p-2.5 text-sm font-semibold text-foreground">
            <div
              className="flex size-7 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: `${currentProposal.project.color || '#3b82f6'}20`, color: currentProposal.project.color || '#3b82f6' }}
            >
              <FolderKanban className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate">{currentProposal.project.name}</div>
              {currentProposal.project.description ? (
                <div className="text-xs font-normal text-muted-foreground truncate">
                  {currentProposal.project.description}
                </div>
              ) : null}
            </div>
            {currentProposal.project.deadline ? (
              <Badge className="gap-1">
                <Calendar className="size-3" />
                <span>{formatJalali(new Date(currentProposal.project.deadline))}</span>
              </Badge>
            ) : null}
          </div>
        ) : null}

        {/* Tasks list */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1">
              <ListTodo className="size-3.5" />
              <span>کارهای پیشنهادی ({activeTasksCount} از {tasks.length} فعال):</span>
            </span>
          </div>

          <div className="space-y-1.5">
            {tasks.map((task, idx) => {
              const isEnabled = task.enabled !== false
              const isEditing = editingTaskId === idx

              return (
                <div
                  key={idx}
                  className={cn(
                    'flex flex-col gap-1.5 rounded-lg border p-2.5 transition-all text-xs',
                    isEnabled
                      ? 'border-border bg-card'
                      : 'border-border/40 bg-muted/20 opacity-60',
                  )}
                >
                  <div className="flex items-start gap-2">
                    {actionStatus === 'pending' ? (
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => handleToggleTask(idx)}
                        className="mt-0.5 size-4 rounded border-border text-accent focus:ring-accent"
                      />
                    ) : (
                      <span className="flex size-4 shrink-0 items-center justify-center text-accent">
                        ✓
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            autoFocus
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(idx)
                              if (e.key === 'Escape') setEditingTaskId(null)
                            }}
                            className="h-7 text-xs"
                          />
                          <Button size="sm" variant="secondary" className="h-7 px-2" onClick={() => handleSaveEdit(idx)}>
                            ذخیره
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className={cn('font-medium text-foreground', !isEnabled && 'line-through')}>
                            {task.title}
                          </span>
                          {actionStatus === 'pending' ? (
                            <button
                              type="button"
                              onClick={() => handleStartEdit(idx, task.title)}
                              className="text-muted-foreground hover:text-foreground"
                              title="ویرایش عنوان"
                            >
                              <Pencil className="size-3" />
                            </button>
                          ) : null}
                        </div>
                      )}

                      {task.description ? (
                        <p className="mt-0.5 text-muted-foreground">{task.description}</p>
                      ) : null}

                      {/* Chips: priority, duration, due date, tags */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge className={PRIORITY_CLASS[task.priority] || ''}>
                          {PRIORITY_LABEL[task.priority] || task.priority}
                        </Badge>

                        {task.estimatedDuration ? (
                          <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            <Clock className="size-2.5" />
                            {formatDuration(task.estimatedDuration)}
                          </span>
                        ) : null}

                        {task.dueDate ? (
                          <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            <Calendar className="size-2.5" />
                            {formatJalali(new Date(task.dueDate))}
                          </span>
                        ) : null}

                        {task.tags && task.tags.length > 0
                          ? task.tags.map((tg) => (
                              <span
                                key={tg}
                                className="inline-flex items-center gap-0.5 rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                              >
                                <Tag className="size-2.5" />
                                {tg}
                              </span>
                            ))
                          : null}
                      </div>

                      {/* Verified links from real search results */}
                      {task.links && task.links.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {task.links.map((link, lIdx) => (
                            <a
                              key={lIdx}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] text-accent hover:underline"
                            >
                              <ExternalLink className="size-2.5" />
                              <span>{link.label || 'منبع معتبر'}</span>
                            </a>
                          ))}
                        </div>
                      ) : null}

                      {/* Subtasks */}
                      {task.subtasks && task.subtasks.length > 0 ? (
                        <div className="mt-2 space-y-1 border-t border-border/60 pt-1.5">
                          <div className="text-[10px] font-semibold text-muted-foreground">زیرکارها:</div>
                          {task.subtasks.map((st, stIdx) => (
                            <div key={stIdx} className="flex items-center gap-1.5 text-muted-foreground">
                              <span className="size-1.5 rounded-full bg-muted-foreground" />
                              <span>{st.title}</span>
                              {st.estimatedDuration ? (
                                <span className="text-[10px] tabular-nums">({st.estimatedDuration} دقیقه)</span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Action Buttons for pending proposal */}
        {actionStatus === 'pending' ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={activeTasksCount === 0 || isProcessing}
                onClick={() => onConfirm(currentProposal)}
              >
                <Sparkles className="size-3.5" />
                <span>بساز ({activeTasksCount} کار)</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                disabled={isProcessing}
                onClick={onRequestChanges}
              >
                <Pencil className="size-3.5" />
                <span>تغییر بده</span>
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              disabled={isProcessing}
              onClick={onCancel}
              className="text-muted-foreground hover:text-foreground"
            >
              لغو
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}
