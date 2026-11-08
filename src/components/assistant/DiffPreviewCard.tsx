import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { Badge, Button, Card, CardBody } from '@/components/ui'
import type { AssistantProposal } from '@/types/assistant'
import { formatDuration } from '@/utils/date'
import { formatJalali } from '@/utils/jalali'
import { cn } from '@/utils/cn'

interface DiffPreviewCardProps {
  proposal: AssistantProposal
  actionStatus?: 'pending' | 'executed' | 'cancelled' | 'undone'
  onConfirm: (proposal: AssistantProposal) => void
  onRollback: () => void
  onCancel: () => void
  isProcessing?: boolean
}

export function DiffPreviewCard({
  proposal,
  actionStatus = 'pending',
  onConfirm,
  onRollback,
  onCancel,
  isProcessing = false,
}: DiffPreviewCardProps) {
  const currentProposal = proposal

  const isDelete = proposal.type === 'bulk_delete'
  const isEdit = proposal.type === 'bulk_edit'
  const isSchedule = proposal.type === 'schedule_planner'
  const isHabit = proposal.type === 'create_habits'
  const isGoal = proposal.type === 'create_goal'

  return (
    <Card
      className={cn(
        'my-2 border bg-card shadow-sm',
        isDelete ? 'border-rose-500/30' : 'border-border/80',
      )}
    >
      <CardBody className="p-3.5 sm:p-4">
        {/* Status header if already executed/undone/cancelled */}
        {actionStatus === 'executed' ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-500/10 p-2.5 text-xs font-semibold text-emerald-500">
            <div className="flex items-center gap-1.5">
              <Check className="size-4" />
              <span>عملیات با موفقیت اعمال شد.</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
              onClick={onRollback}
              disabled={isProcessing}
            >
              <Undo2 className="size-3.5" />
              <span>واگردانی عملیات</span>
            </Button>
          </div>
        ) : actionStatus === 'undone' ? (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
            <RotateCcw className="size-4" />
            <span>تغییرات با موفقیت واگردانی و بازگردانده شدند.</span>
          </div>
        ) : actionStatus === 'cancelled' ? (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
            <X className="size-4" />
            <span>عملیات لغو شد.</span>
          </div>
        ) : null}

        {/* Delete Warning */}
        {isDelete ? (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-rose-500/10 p-2.5 text-xs font-medium text-rose-500">
            <AlertTriangle className="size-4 shrink-0" />
            <span>حذف آیتم‌ها نیاز به تأیید نهایی شما دارد. پس از حذف نیز امکان واگردانی وجود دارد.</span>
          </div>
        ) : null}

        {/* Content based on type */}
        {isEdit && currentProposal.edits ? (
          <div className="space-y-2 text-xs">
            <div className="font-semibold text-foreground">تغییرات پیشنهادی:</div>
            <div className="space-y-1.5">
              {currentProposal.edits.map((edit, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-md border border-border p-2">
                  <span className="font-medium text-foreground">{edit.currentTitle}</span>
                  <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                    <span className="line-through">{String(edit.oldValue ?? 'خالی')}</span>
                    <ArrowRight className="size-3 text-accent rtl:rotate-180" />
                    <span className="font-semibold text-accent">{String(edit.newValue ?? 'خالی')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {isDelete && currentProposal.deletions ? (
          <div className="space-y-2 text-xs">
            <div className="font-semibold text-foreground">آیتم‌های مشمول حذف:</div>
            <div className="space-y-1">
              {currentProposal.deletions.map((del, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-md bg-rose-500/5 p-2 text-rose-400">
                  <Trash2 className="size-3.5" />
                  <span className="font-medium">{del.title}</span>
                  <span className="text-[10px] text-muted-foreground">({del.entityType})</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {isSchedule && currentProposal.scheduleSlots ? (
          <div className="space-y-2 text-xs">
            <div className="font-semibold text-foreground">برنامه‌ریزی زمانی کارها:</div>
            <div className="space-y-1.5">
              {currentProposal.scheduleSlots.map((slot, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-md border border-border p-2">
                  <span className="font-medium text-foreground">{slot.taskTitle}</span>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Badge className="gap-1 bg-accent/15 text-accent border-accent/30">
                      <Calendar className="size-3" />
                      <span>{formatJalali(new Date(slot.startDate))}</span>
                    </Badge>
                    <span className="text-[11px] font-mono">({formatDuration(slot.duration)})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {isHabit && currentProposal.habits ? (
          <div className="space-y-2 text-xs">
            <div className="font-semibold text-foreground">عادت‌های پیشنهادی:</div>
            <div className="space-y-1.5">
              {currentProposal.habits.map((habit, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-md border border-border p-2">
                  <span className="font-medium text-foreground">{habit.title}</span>
                  <Badge className="border-border bg-muted/60 text-muted-foreground">
                    {habit.target} {habit.unit || 'بار'} در {habit.frequency === 'daily' ? 'روز' : 'هفته'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {isGoal && currentProposal.goal ? (
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 rounded-md bg-muted/40 p-2.5">
              <Target className="size-4 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-foreground">{currentProposal.goal.title}</div>
                {currentProposal.goal.description ? (
                  <div className="text-muted-foreground">{currentProposal.goal.description}</div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* Action Buttons for pending proposal */}
        {actionStatus === 'pending' ? (
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <Button
              variant={isDelete ? 'danger' : 'primary'}
              size="sm"
              disabled={isProcessing}
              onClick={() => onConfirm(currentProposal)}
            >
              {isDelete ? <Trash2 className="size-3.5" /> : <Sparkles className="size-3.5" />}
              <span>{isDelete ? 'تأیید و حذف' : 'اعمال تغییرات'}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              disabled={isProcessing}
              onClick={onCancel}
              className="text-muted-foreground hover:text-foreground"
            >
              انصراف
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}
