import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  Check,
  Coffee,
  GripVertical,
  ListChecks,
  Plus,
  Search,
  Sparkles,
  Undo2,
  Wand2,
  X,
  Bell,
  BellOff,
  BellRing,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createWorkerTicker,
  getNotificationPermission,
  playNotificationChime,
  requestNotificationPermission,
  sendDesktopNotification,
} from '@/services/notifications'
import { buildDayPlan, effectiveDuration } from '@/services/planner'
import {
  autoSchedule,
  behindScheduleReport,
  buildReschedulePlans,
  proposalToPatches,
  rescheduleToPatches,
  urgencyScore,
  type PlanProposal,
  type ReschedulePlan,
} from '@/services/planner'
import { QuickAddDialog } from '@/components/tasks/QuickAddDialog'
import { TaskEditorModal } from '@/components/tasks/TaskEditorModal'
import { TaskRow } from '@/components/tasks/TaskRow'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  JalaliDatePicker,
  Modal,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  toast,
} from '@/components/ui'
import { CLOSED_TASK_STATUSES } from '@/config/constants'
import { priorityLabel, useT } from '@/i18n'
import { projectRepo } from '@/storage/projectRepo'
import { taskRepo } from '@/storage/taskRepo'
import { useSettings, useWorkspaceId } from '@/stores/workspace'
import type { Priority, Task } from '@/types'
import { cn } from '@/utils/cn'
import {
  addDays,
  dayAtMinutes,
  dayRange,
  formatDayLabel,
  formatDuration,
  formatMinutesOfDay,
  fromDayKey,
  minutesIntoDay,
  toDayKey,
  toISO,
} from '@/utils/date'

/**
 * The day planner: one day at a time, laid out on the working-hours timeline.
 *
 * Proposals are always preview-then-apply — the same contract the AI planner
 * uses — so the user sees exactly which blocks will move before anything is
 * written.
 */

export function PlannerPage() {
  const t = useT()
  const workspaceId = useWorkspaceId()
  const settings = useSettings()

  const [day, setDay] = useState(() => toDayKey(new Date()))
  const [zoom, setZoom] = useState<'compact' | 'full'>('compact')
  const [proposal, setProposal] = useState<PlanProposal | null>(null)
  const [reschedulePlan, setReschedulePlan] = useState<ReschedulePlan | null>(null)
  const [applying, setApplying] = useState(false)

  // Interactive enhancements & performance states
  const [now, setNow] = useState(() => new Date())
  const [bufferMinutes, setBufferMinutes] = useState<number>(0)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddStartDate, setQuickAddStartDate] = useState<string | null>(null)
  const [backlogSearch, setBacklogSearch] = useState('')
  const [backlogPriority, setBacklogPriority] = useState<Priority | 'all'>('all')

  // Backlog and Timeline drag & drop refs and state
  const timelineRef = useRef<HTMLDivElement>(null)
  const backlogRef = useRef<HTMLDivElement>(null)
  const [draggingBacklogTask, setDraggingBacklogTask] = useState<Task | null>(null)
  const [dropSlot, setDropSlot] = useState<{ startMinutes: number; duration: number } | null>(null)
  const [isDraggingOverBacklog, setIsDraggingOverBacklog] = useState(false)

  // Live task transition alert state
  interface TransitionAlert {
    currentTask: Task
    previousTask?: Task | null
    startTime: number
    endTime: number
  }

  const [activeTransition, setActiveTransition] = useState<TransitionAlert | null>(null)
  const alertedTaskIdsRef = useRef<Set<string>>(new Set())
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    const saved = localStorage.getItem('flow_planner_notifications')
    return saved !== null ? saved === 'true' : true
  })
  const [permission, setPermission] = useState(getNotificationPermission())

  // Live ticker: updates "now" every 20s using unthrottled worker so it stays accurate in background
  useEffect(() => {
    const stopTicker = createWorkerTicker(() => {
      setNow(new Date())
    }, 20_000)
    return () => stopTicker()
  }, [])

  async function handleGrantPermission() {
    const res = await requestNotificationPermission()
    setPermission(res)
    if (res === 'granted') {
      setNotificationsEnabled(true)
      localStorage.setItem('flow_planner_notifications', 'true')
      toast.success(t('focusNotifGranted'))
    } else {
      toast.info(t('plannerNotifBlockedAlert'))
    }
  }

  async function handleToggleNotifications() {
    if (!notificationsEnabled) {
      const res = await requestNotificationPermission()
      setPermission(res)
      if (res !== 'granted') {
        toast.info(t('plannerNotifBlockedAlert'))
      }
      setNotificationsEnabled(true)
      localStorage.setItem('flow_planner_notifications', 'true')
      toast.success(t('plannerNotificationsEnabled'))
    } else {
      setNotificationsEnabled(false)
      localStorage.setItem('flow_planner_notifications', 'false')
      toast.info(t('plannerNotificationsDisabled'))
    }
  }

  async function triggerDesktopNotification(title: string, body: string) {
    if (!notificationsEnabled) return
    playNotificationChime()
    await sendDesktopNotification({
      title,
      body,
      tag: 'flow-task-transition',
    })
  }

  async function handleUnschedule(task: Task) {
    try {
      await taskRepo.update(task.id, { startDate: null })
      toast.success(t('plannerToastReturnedToBacklog', { title: task.title }))
    } catch (err) {
      toast.error((err as Error).message || t('plannerToastReturnError'))
    }
  }

  const { start, end } = dayRange(day)
  const scheduled =
    useLiveQuery(
      () => taskRepo.scheduledBetween(workspaceId, toISO(start), toISO(end)),
      [workspaceId, day],
    ) ?? []
  const backlogSource =
    useLiveQuery(
      () =>
        taskRepo.list(workspaceId, {
          status: ['inbox', 'planned', 'in_progress', 'blocked'],
          scheduled: false,
        }),
      [workspaceId],
    ) ?? []
  const allOpen =
    useLiveQuery(
      () =>
        taskRepo.list(workspaceId, {
          status: ['inbox', 'planned', 'in_progress', 'blocked'],
        }),
      [workspaceId],
    ) ?? []

  const plan = useMemo(
    () => buildDayPlan(day, scheduled, [], settings.planning),
    [day, scheduled, settings.planning],
  )

  const behind = useMemo(
    () => behindScheduleReport(plan, now, settings.planning),
    [plan, now, settings.planning],
  )
  const reschedulePlans = useMemo(
    () =>
      day === toDayKey(now) && behind.missedBlocks.length > 0
        ? buildReschedulePlans(plan, now, settings.planning, toDayKey(new Date(now.getTime() + 86_400_000)))
        : [],
    [plan, now, settings.planning, day, behind.missedBlocks.length],
  )

  const filteredBacklog = useMemo(() => {
    let list = backlogSource
    if (backlogSearch.trim()) {
      const q = backlogSearch.toLowerCase().trim()
      list = list.filter((task) => task.title.toLowerCase().includes(q))
    }
    if (backlogPriority !== 'all') {
      list = list.filter((task) => task.priority === backlogPriority)
    }
    return [...list].sort((a, b) => urgencyScore(b, now) - urgencyScore(a, now)).slice(0, 15)
  }, [backlogSource, backlogSearch, backlogPriority, now])

  const projectNames = useLiveQuery(
    async () => {
      const rows = await projectRepo.list(workspaceId)
      return new Map(rows.map((p) => [p.id, p]))
    },
    [workspaceId],
  )

  // Monitor when red current time line enters a task's timeframe
  useEffect(() => {
    if (day !== toDayKey(now)) return
    const nowMinutes = minutesIntoDay(now)

    // Find any block currently active (where red line is inside [start, end))
    const activeBlock = plan.blocks.find(
      (b) =>
        !CLOSED_TASK_STATUSES.includes(b.task.status) &&
        nowMinutes >= b.start &&
        nowMinutes < b.end,
    )

    if (activeBlock && !alertedTaskIdsRef.current.has(activeBlock.task.id)) {
      alertedTaskIdsRef.current.add(activeBlock.task.id)

      // Find the most recent unfinished block scheduled earlier today
      const previousIncompleteBlock = [...plan.blocks]
        .filter(
          (b) =>
            b.task.id !== activeBlock.task.id &&
            b.end <= activeBlock.start &&
            !CLOSED_TASK_STATUSES.includes(b.task.status),
        )
        .sort((a, b) => b.end - a.end)[0]

      setActiveTransition({
        currentTask: activeBlock.task,
        previousTask: previousIncompleteBlock?.task ?? null,
        startTime: activeBlock.start,
        endTime: activeBlock.end,
      })

      if (notificationsEnabled) {
        playNotificationChime()
        const body = previousIncompleteBlock
          ? `${t('plannerPrevTaskPending', { title: previousIncompleteBlock.task.title })} ${t('plannerTransitionDesc', { title: activeBlock.task.title })}`
          : t('plannerTransitionDesc', { title: activeBlock.task.title })
        triggerDesktopNotification(
          t('plannerTransitionTitle', { title: activeBlock.task.title }),
          body,
        )
      }
    }
  }, [now, day, plan.blocks, notificationsEnabled, t])

  function shiftDay(delta: number) {
    setDay(toDayKey(addDays(fromDayKey(day), delta)))
  }

  function handleSlotClick(slotHour: number) {
    setQuickAddStartDate(toISO(dayAtMinutes(day, slotHour * 60)))
    setQuickAddOpen(true)
  }

  function runAutoPlan() {
    const p = autoSchedule({
      day,
      candidates: allOpen,
      existing: scheduled,
      settings: settings.planning,
      allTasks: allOpen,
      bufferMinutes,
    })
    if (p.items.length === 0) {
      toast.info(t('plannerToastNoFit'))
      return
    }
    setProposal(p)
  }

  // Atomic bulk update for top database performance
  async function applyProposal() {
    if (!proposal) return
    setApplying(true)
    try {
      const patches = proposalToPatches(proposal)
      await taskRepo.bulkUpdateSchedule(
        patches.map((patch) => ({
          id: patch.id,
          startDate: patch.startDate,
          status: 'planned' as const,
        })),
      )
      toast.success(t('plannerToastScheduledN', { n: patches.length, day: formatDayLabel(day) }))
      setProposal(null)
    } catch (error) {
      toast.error((error as Error).message || t('plannerToastApplyError'))
    } finally {
      setApplying(false)
    }
  }

  // Atomic bulk update for reschedule actions
  async function applyReschedule() {
    if (!reschedulePlan) return
    setApplying(true)
    try {
      const patches = rescheduleToPatches(reschedulePlan.actions)
      await taskRepo.bulkUpdateSchedule(
        patches.map((patch) => ({
          id: patch.id,
          startDate: patch.startDate,
        })),
      )
      toast.success(t('plannerToastRescheduleApplied', { label: reschedulePlan.label, n: patches.length }))
      setReschedulePlan(null)
    } catch (error) {
      toast.error((error as Error).message || t('plannerToastRescheduleError'))
    } finally {
      setApplying(false)
    }
  }

  async function scheduleSingle(task: Task) {
    const p = autoSchedule({
      day,
      candidates: [task],
      existing: scheduled,
      settings: settings.planning,
      allTasks: allOpen,
      bufferMinutes,
    })
    if (p.items.length === 0) {
      toast.info(t('plannerToastSingleNoSlot', { title: task.title }))
      return
    }
    const patch = proposalToPatches(p)[0]
    await taskRepo.update(patch.id, { startDate: patch.startDate, status: 'planned' })
    toast.success(t('plannerToastSingleScheduled', { title: task.title, time: formatMinutesOfDay(p.items[0].start) }))
  }

  const startHour = Math.floor(plan.workStart / 60)
  const endHour = Math.max(startHour + 1, Math.ceil(plan.workEnd / 60))
  const hourHeight = zoom === 'compact' ? 44 : 64
  const timelineMinutes = (endHour - startHour) * 60

  // Live Time Indicator calculation for today
  const isToday = day === toDayKey(now)
  const nowMinutes = minutesIntoDay(now)
  const isNowWithinTimeline = isToday && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60
  const nowTop = isNowWithinTimeline ? ((nowMinutes - startHour * 60) * hourHeight) / 60 : null

  // Interactive Drag & Drop timeline state & handlers with RAF throttling
  interface DragState {
    taskId: string
    initialMinutes: number
    duration: number
    currentMinutes: number
  }

  const [dragging, setDragging] = useState<DragState | null>(null)

  function handleBlockPointerDown(e: React.PointerEvent, block: (typeof plan.blocks)[number]) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    const startY = e.clientY
    const startX = e.clientX
    const duration = block.end - block.start
    const initialMinutes = block.start
    let isDragging = false
    let rafId: number | null = null

    e.preventDefault()

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        const deltaY = moveEvent.clientY - startY
        const deltaX = Math.abs(moveEvent.clientX - startX)
        if (!isDragging && (Math.abs(deltaY) > 5 || deltaX > 5)) {
          isDragging = true
        }
        if (isDragging) {
          if (backlogRef.current) {
            const rect = backlogRef.current.getBoundingClientRect()
            const overBacklog =
              moveEvent.clientX >= rect.left &&
              moveEvent.clientX <= rect.right &&
              moveEvent.clientY >= rect.top &&
              moveEvent.clientY <= rect.bottom
            setIsDraggingOverBacklog(overBacklog)
          }

          const deltaMinutes = (deltaY / hourHeight) * 60
          const rawNewMinutes = initialMinutes + deltaMinutes
          const snapped = Math.round(rawNewMinutes / 15) * 15
          const clamped = Math.max(0, Math.min(1440 - duration, snapped))
          setDragging({
            taskId: block.task.id,
            initialMinutes,
            duration,
            currentMinutes: clamped,
          })
        }
      })
    }

    const handlePointerUp = async (upEvent: PointerEvent) => {
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)

      const wasOverBacklog =
        isDraggingOverBacklog ||
        (backlogRef.current
          ? (() => {
              const rect = backlogRef.current.getBoundingClientRect()
              return (
                upEvent.clientX >= rect.left &&
                upEvent.clientX <= rect.right &&
                upEvent.clientY >= rect.top &&
                upEvent.clientY <= rect.bottom
              )
            })()
          : false)

      setIsDraggingOverBacklog(false)
      setDragging(null)

      if (wasOverBacklog) {
        await handleUnschedule(block.task)
        return
      }

      const deltaY = upEvent.clientY - startY
      const deltaX = Math.abs(upEvent.clientX - startX)
      if (!isDragging || (Math.abs(deltaY) <= 5 && deltaX <= 5)) {
        setEditingTaskId(block.task.id)
        return
      }

      const deltaMinutes = (deltaY / hourHeight) * 60
      const rawNewMinutes = initialMinutes + deltaMinutes
      const snapped = Math.round(rawNewMinutes / 15) * 15
      const clamped = Math.max(0, Math.min(1440 - duration, snapped))

      if (clamped !== initialMinutes) {
        const newStartDate = toISO(dayAtMinutes(day, clamped))
        try {
          await taskRepo.update(block.task.id, { startDate: newStartDate })
          toast.success(
            t('plannerToastMoved', {
              title: block.task.title,
              time: formatMinutesOfDay(clamped),
            }),
          )
        } catch (err) {
          toast.error((err as Error).message || t('plannerToastMoveError'))
        }
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  // Backlog HTML5 drag & drop handlers
  function handleBacklogDragStart(e: React.DragEvent<HTMLDivElement>, task: Task) {
    e.dataTransfer.setData('text/plain', task.id)
    e.dataTransfer.setData('application/json', JSON.stringify({ taskId: task.id }))
    e.dataTransfer.effectAllowed = 'move'
    setDraggingBacklogTask(task)
  }

  function handleBacklogDragEnd() {
    setDraggingBacklogTask(null)
    setDropSlot(null)
  }

  function handleTimelineDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    if (!timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top
    const minutesFromTop = (y / hourHeight) * 60
    const rawMinutes = startHour * 60 + minutesFromTop
    const snapped = Math.round(rawMinutes / 15) * 15

    const duration = draggingBacklogTask
      ? effectiveDuration(draggingBacklogTask, settings.planning)
      : (settings.planning.defaultTaskDuration ?? 30)

    const maxStart = Math.max(startHour * 60, endHour * 60 - duration)
    const clamped = Math.max(startHour * 60, Math.min(maxStart, snapped))

    if (!dropSlot || dropSlot.startMinutes !== clamped || dropSlot.duration !== duration) {
      setDropSlot({ startMinutes: clamped, duration })
    }
  }

  function handleTimelineDragLeave(e: React.DragEvent) {
    if (!timelineRef.current || !e.relatedTarget || !timelineRef.current.contains(e.relatedTarget as Node)) {
      setDropSlot(null)
    }
  }

  async function handleTimelineDrop(e: React.DragEvent) {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('text/plain') || draggingBacklogTask?.id
    const targetSlot = dropSlot
    setDropSlot(null)
    setDraggingBacklogTask(null)

    if (!taskId) return
    const task = allOpen.find((t) => t.id === taskId)
    if (!task) return

    let targetMinutes = targetSlot?.startMinutes
    if (targetMinutes == null && timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect()
      const y = e.clientY - rect.top
      const minutesFromTop = (y / hourHeight) * 60
      const rawMinutes = startHour * 60 + minutesFromTop
      const snapped = Math.round(rawMinutes / 15) * 15
      const duration = effectiveDuration(task, settings.planning)
      const maxStart = Math.max(startHour * 60, endHour * 60 - duration)
      targetMinutes = Math.max(startHour * 60, Math.min(maxStart, snapped))
    }

    if (targetMinutes == null) return

    const newStartDate = toISO(dayAtMinutes(day, targetMinutes))
    try {
      await taskRepo.update(task.id, { startDate: newStartDate, status: 'planned' })
      toast.success(
        t('plannerToastSingleScheduled', {
          title: task.title,
          time: formatMinutesOfDay(targetMinutes),
        }),
      )
    } catch (err) {
      toast.error((err as Error).message || t('plannerToastMoveError'))
    }
  }


  return (
    <>
      <PageHeader
        title={t('plannerTitle')}
        description={t('plannerDesc')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              value={zoom}
              options={[
                { value: 'compact', label: t('plannerZoomCompact') },
                { value: 'full', label: t('plannerZoomFull') },
              ]}
              onChange={setZoom}
            />

            {/* Buffer Selector */}
            <div
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground shadow-sm"
              title={t('plannerBuffer')}
            >
              <Coffee className="size-3.5 text-accent" />
              <span className="hidden sm:inline">{t('plannerBuffer')}:</span>
              <select
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(Number(e.target.value))}
                className="bg-transparent font-medium text-foreground outline-none cursor-pointer"
              >
                <option value={0} className="bg-card text-foreground">{t('plannerBufferNone')}</option>
                <option value={5} className="bg-card text-foreground">{t('plannerBuffer5')}</option>
                <option value={10} className="bg-card text-foreground">{t('plannerBuffer10')}</option>
                <option value={15} className="bg-card text-foreground">{t('plannerBuffer15')}</option>
              </select>
            </div>

            {/* Live Alerts Toggle */}
            <Button
              variant={notificationsEnabled ? 'outline' : 'ghost'}
              size="sm"
              className={cn(
                'h-8 gap-1.5 px-2.5 text-xs',
                notificationsEnabled ? 'border-accent/40 text-accent bg-accent/5' : 'text-muted-foreground',
              )}
              onClick={() => void handleToggleNotifications()}
              title={notificationsEnabled ? t('plannerNotificationsEnabled') : t('plannerNotificationsDisabled')}
            >
              {notificationsEnabled ? <Bell className="size-3.5 text-accent" /> : <BellOff className="size-3.5" />}
              <span className="hidden sm:inline">{t('plannerNotificationsToggle')}</span>
            </Button>

            <Button variant="primary" onClick={runAutoPlan}>
              <Wand2 className="size-4" />
              {t('plannerAutoPlan')}
            </Button>
          </div>
        }
      />

      {/* ------------------------------------------------------------ day nav -- */}
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label={t('plannerPrevDay')} onClick={() => shiftDay(-1)}>
            <ArrowLeft className="size-4 rtl:rotate-180" />
          </Button>
          <JalaliDatePicker
            value={day}
            onChange={(v) => v && setDay(v)}
            className="w-44"
          />
          <Button variant="outline" size="icon" aria-label={t('plannerNextDay')} onClick={() => shiftDay(1)}>
            <ArrowRight className="size-4 rtl:rotate-180" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDay(toDayKey(new Date()))}>
            {t('plannerToday')}
          </Button>
          <span className="ms-2 text-sm font-medium">{formatDayLabel(day)}</span>

          <div className="ms-auto flex items-center gap-3">
            <div className="w-40">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{t('plannerLoad')}</span>
                <span className="tabular-nums">
                  {formatDuration(plan.scheduledMinutes)} / {formatDuration(plan.capacityMinutes)}
                </span>
              </div>
              <ProgressBar
                className="mt-1"
                value={plan.loadPercent}
                barClassName={plan.overbooked ? 'bg-rose-500' : plan.loadPercent > 85 ? 'bg-amber-500' : undefined}
              />
            </div>
            {plan.overbooked ? (
              <Badge className="border-rose-500/25 bg-rose-500/10 text-rose-400">
                {t('plannerBookedPercent', { n: plan.loadPercent })}
              </Badge>
            ) : null}
            {plan.conflictCount > 0 ? (
              <Badge className="border-amber-500/25 bg-amber-500/10 text-amber-400">
                <AlertTriangle className="size-3" />
                {plan.conflictCount === 1
                  ? t('plannerConflictCount1')
                  : t('plannerConflictCountN', { n: plan.conflictCount })}
              </Badge>
            ) : null}
          </div>
        </div>
      </Card>

      {/* ------------------------------------------- desktop notification prompt -- */}
      {permission !== 'granted' ? (
        <Card className="mb-4 border-amber-500/40 bg-amber-500/10 p-3.5 shadow-sm animate-in fade-in">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-500">
                <BellOff className="size-4.5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground">
                  {t('plannerEnableNotifTitle')}
                </h4>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  {t('plannerEnableNotifDesc')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              <Button
                size="sm"
                variant="primary"
                className="h-8 text-xs font-semibold gap-1.5"
                onClick={() => void handleGrantPermission()}
              >
                <Bell className="size-3.5" />
                <span>{t('plannerEnableNotifBtn')}</span>
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {/* ---------------------------------- behind schedule & transition suggestions -- */}
      {reschedulePlans.length > 0 || activeTransition ? (
        <Card className="mb-4 border-amber-500/30 bg-amber-500/5 overflow-hidden">
          {activeTransition ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <BellRing className="size-4 shrink-0 text-amber-500 animate-bounce" />
                <span className="font-semibold text-foreground">
                  {t('plannerTransitionTitle', { title: activeTransition.currentTask.title })}
                </span>
                {activeTransition.previousTask ? (
                  <span className="text-amber-500 font-medium">
                    · {t('plannerPrevTaskPending', { title: activeTransition.previousTask.title })}
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {activeTransition.previousTask ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6.5 px-2 text-[11px] border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 hover:border-emerald-500"
                      onClick={async () => {
                        if (activeTransition.previousTask) {
                          await taskRepo.toggleComplete(activeTransition.previousTask.id)
                          toast.success(t('toastCompleted', { title: activeTransition.previousTask.title }))
                          setActiveTransition((prev) => (prev ? { ...prev, previousTask: null } : null))
                        }
                      }}
                    >
                      <Check className="size-3" />
                      <span>{t('plannerCompletePrevTask')}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={async () => {
                        if (activeTransition.previousTask) {
                          await handleUnschedule(activeTransition.previousTask)
                          setActiveTransition((prev) => (prev ? { ...prev, previousTask: null } : null))
                        }
                      }}
                    >
                      <Undo2 className="size-3" />
                      <span>{t('plannerReturnPrevToBacklog')}</span>
                    </Button>
                  </>
                ) : null}

                <button
                  type="button"
                  onClick={() => setActiveTransition(null)}
                  className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title={t('plannerDismissNotification')}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ) : null}

          {reschedulePlans.length > 0 ? (
            <>
              <CardHeader
                title={
                  behind.missedBlocks.length === 1
                    ? t('plannerBehindScheduleTitle1')
                    : t('plannerBehindScheduleTitleN', { n: behind.missedBlocks.length })
                }
                description={t('plannerBehindScheduleDesc', { dur: formatDuration(behind.behindMinutes) })}
                icon={<AlertTriangle className="size-4 text-amber-400" />}
              />
              <CardBody className="grid gap-2 sm:grid-cols-3">
                {reschedulePlans.map((rp) => (
                  <button
                    key={rp.strategy}
                    type="button"
                    onClick={() => setReschedulePlan(rp)}
                    className="rounded-lg border border-border bg-card p-3 text-start transition-colors hover:border-accent"
                  >
                    <div className="text-sm font-medium">{rp.label}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{rp.description}</p>
                  </button>
                ))}
              </CardBody>
            </>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        {/* ------------------------------------------------------- timeline -- */}
        <Card className="overflow-hidden">
          <CardHeader
            title={t('plannerTimelineTitle')}
            description={t('plannerTimelineDesc', {
              start: formatMinutesOfDay(plan.workStart),
              end: formatMinutesOfDay(plan.workEnd),
              blocks: plan.blocks.length,
            })}
            icon={<CalendarDays className="size-4" />}
          />
          <div
            ref={timelineRef}
            className={cn(
              'relative transition-colors select-none',
              draggingBacklogTask && 'bg-accent/[0.03] ring-1 ring-accent/30',
            )}
            style={{ height: timelineMinutes * (hourHeight / 60) }}
            onDragOver={handleTimelineDragOver}
            onDragLeave={handleTimelineDragLeave}
            onDrop={handleTimelineDrop}
          >
            {/* Hour Grid Lines with Click-to-Add */}
            {Array.from({ length: endHour - startHour }, (_, i) => {
              const slotHour = startHour + i
              return (
                <div
                  key={i}
                  onClick={() => handleSlotClick(slotHour)}
                  className="group/slot absolute inset-x-0 border-t border-border/60 hover:bg-accent/5 transition-colors cursor-pointer"
                  style={{ top: i * hourHeight, height: hourHeight }}
                  title={`${formatMinutesOfDay(slotHour * 60)} — ${t('plannerClickToSchedule')}`}
                >
                  <span className="absolute -top-2 start-2 bg-card px-1 text-[10px] tabular-nums text-muted-foreground select-none">
                    {String(slotHour).padStart(2, '0')}:00
                  </span>
                  <span className="absolute top-1 end-3 opacity-0 group-hover/slot:opacity-100 text-[10px] text-muted-foreground hover:text-accent flex items-center gap-1 transition-opacity select-none">
                    <Plus className="size-3" />
                    {t('plannerAddAtTime')}
                  </span>
                </div>
              )
            })}

            {/* Live Current Time Line Indicator */}
            {nowTop != null ? (
              <div
                className="pointer-events-none absolute inset-x-0 z-20 flex items-center transition-all duration-300"
                style={{ top: nowTop }}
              >
                <div className="absolute start-12 -translate-y-1/2 flex items-center gap-1.5 bg-background/95 px-1.5 py-0.5 rounded-full border border-rose-500/30 shadow-sm">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
                  </span>
                  <span className="text-[10px] font-bold text-rose-500 tabular-nums">
                    {formatMinutesOfDay(nowMinutes)}
                  </span>
                </div>
                <div className="ms-28 w-full border-t-2 border-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.35)]" />
              </div>
            ) : null}

            {/* Scheduled Task Blocks */}
            {plan.blocks.map((block) => {
              const isBeingDragged = dragging?.taskId === block.task.id
              const duration = block.end - block.start
              const displayStart = isBeingDragged ? dragging.currentMinutes : block.start
              const top = ((displayStart - startHour * 60) * hourHeight) / 60
              const height = Math.max(24, (duration * hourHeight) / 60)
              const closed = CLOSED_TASK_STATUSES.includes(block.task.status)
              const conflict = block.conflictsWith.length > 0
              return (
                <div key={block.task.id}>
                  {/* Ghost block showing original position while dragging */}
                  {isBeingDragged ? (
                    <div
                      className="pointer-events-none absolute start-16 end-3 rounded-lg border-2 border-dashed border-accent/40 bg-accent/5 opacity-50 transition-none"
                      style={{
                        top: ((block.start - startHour * 60) * hourHeight) / 60,
                        height,
                      }}
                    />
                  ) : null}

                  <div
                    onPointerDown={(e) => handleBlockPointerDown(e, block)}
                    draggable={!closed}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', block.task.id)
                      e.dataTransfer.setData(
                        'application/json',
                        JSON.stringify({ taskId: block.task.id, source: 'timeline' }),
                      )
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    title={`${block.task.title} · ${formatMinutesOfDay(displayStart)}–${formatMinutesOfDay(displayStart + duration)}${conflict ? ` · ${t('plannerOverlapping')}` : ''} — ${t('plannerDragHint')}`}
                    className={cn(
                      'group/block absolute start-16 end-3 overflow-hidden rounded-lg border px-2.5 py-1.5 text-xs select-none touch-none',
                      isBeingDragged
                        ? 'z-40 shadow-2xl ring-2 ring-accent scale-[1.02] cursor-grabbing bg-card opacity-95 transition-none'
                        : 'cursor-grab hover:shadow-md hover:border-accent hover:z-10 transition-all duration-150 shadow-sm',
                      closed ? 'border-border bg-muted/40 opacity-60' : 'border-border bg-card',
                      conflict && !isBeingDragged && 'border-amber-500/50 bg-amber-500/5',
                    )}
                    style={{ top, height }}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1 min-w-0">
                        <GripVertical className="size-3 shrink-0 text-muted-foreground/40 group-hover/block:text-accent transition-colors" />
                        <span className={cn('truncate font-medium group-hover/block:text-accent transition-colors', closed && 'line-through')}>
                          {block.task.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {isBeingDragged ? (
                          <span className="rounded bg-accent/20 px-1 py-0.5 text-[10px] font-bold text-accent tabular-nums animate-pulse">
                            {formatMinutesOfDay(displayStart)}
                          </span>
                        ) : (
                          <span className="tabular-nums text-muted-foreground">
                            {formatMinutesOfDay(block.start)}
                          </span>
                        )}
                        {!isBeingDragged && !closed ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              void handleUnschedule(block.task)
                            }}
                            title={t('plannerReturnToBacklogHint')}
                            className="opacity-0 group-hover/block:opacity-100 rounded p-0.5 text-muted-foreground hover:bg-accent/20 hover:text-accent transition-all cursor-pointer"
                            aria-label={t('plannerReturnToBacklog')}
                          >
                            <Undo2 className="size-3" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {height >= 44 ? (
                      <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground ps-4">
                        <span>{formatDuration(duration)}</span>
                        {conflict && !isBeingDragged ? <span>· {t('plannerOverlapping')}</span> : null}
                        {block.task.priority !== 'medium' ? <span>· {priorityLabel(block.task.priority)}</span> : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}

            {/* Backlog Drop Target Live Preview */}
            {dropSlot && draggingBacklogTask ? (
              <div
                className="pointer-events-none absolute start-16 end-3 z-30 overflow-hidden rounded-lg border-2 border-dashed border-accent bg-accent/20 px-3 py-2 shadow-lg backdrop-blur-xs transition-all duration-75 animate-in fade-in"
                style={{
                  top: ((dropSlot.startMinutes - startHour * 60) * hourHeight) / 60,
                  height: Math.max(32, (dropSlot.duration * hourHeight) / 60),
                }}
              >
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-accent">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Sparkles className="size-3.5 shrink-0 animate-pulse text-accent" />
                    <span className="truncate">{draggingBacklogTask.title}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 rounded bg-accent/25 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                    {formatMinutesOfDay(dropSlot.startMinutes)} –{' '}
                    {formatMinutesOfDay(dropSlot.startMinutes + dropSlot.duration)}
                  </div>
                </div>
                {Math.max(32, (dropSlot.duration * hourHeight) / 60) >= 44 ? (
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-accent/80 ps-5">
                    <span>{formatDuration(dropSlot.duration)}</span>
                    <span>·</span>
                    <span>{t('plannerDropToSchedule')}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {plan.blocks.length === 0 && !dropSlot ? (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center pointer-events-none">
                <p className="text-sm text-muted-foreground">
                  {draggingBacklogTask ? t('plannerDropZoneHint') : t('plannerTimelineEmpty')}
                </p>
              </div>
            ) : null}
          </div>
        </Card>

        {/* -------------------------------------------------------- backlog -- */}
        <Card
          ref={backlogRef}
          className={cn(
            'flex flex-col transition-all',
            isDraggingOverBacklog && 'ring-2 ring-accent border-accent bg-accent/5',
          )}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setIsDraggingOverBacklog(true)
          }}
          onDragLeave={(e) => {
            if (!backlogRef.current?.contains(e.relatedTarget as Node)) {
              setIsDraggingOverBacklog(false)
            }
          }}
          onDrop={async (e) => {
            e.preventDefault()
            setIsDraggingOverBacklog(false)
            const taskId = e.dataTransfer.getData('text/plain')
            if (taskId) {
              const task = scheduled.find((t) => t.id === taskId)
              if (task) {
                await handleUnschedule(task)
              }
            }
          }}
        >
          {isDraggingOverBacklog ? (
            <div className="flex items-center justify-center gap-2 border-b border-accent/40 bg-accent/15 px-3 py-2 text-xs font-semibold text-accent animate-pulse">
              <Undo2 className="size-3.5" />
              <span>{t('plannerDropBacklogHint')}</span>
            </div>
          ) : null}
          <CardHeader
            title={t('plannerBacklogTitle')}
            description={t('plannerBacklogDesc')}
            icon={<ListChecks className="size-4" />}
          />

          {/* Backlog Search & Filter Bar */}
          <div className="px-4 pb-3 space-y-2 border-b border-border/50">
            <div className="relative">
              <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                type="text"
                value={backlogSearch}
                onChange={(e) => setBacklogSearch(e.target.value)}
                placeholder={t('plannerSearchBacklog')}
                className="w-full rounded-md border border-border bg-muted/30 ps-8 pe-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:bg-background focus:outline-none transition-colors"
              />
              {backlogSearch ? (
                <button
                  type="button"
                  onClick={() => setBacklogSearch('')}
                  className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                >
                  ✕
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              {(['all', 'critical', 'high', 'medium', 'low'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setBacklogPriority(p)}
                  className={cn(
                    'rounded px-2 py-0.5 font-medium transition-colors',
                    backlogPriority === p
                      ? 'bg-accent/15 text-accent font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  {p === 'all'
                    ? t('plannerFilterAll')
                    : p === 'critical'
                      ? t('plannerFilterCritical')
                      : p === 'high'
                        ? t('plannerFilterHigh')
                        : priorityLabel(p)}
                </button>
              ))}
            </div>
          </div>

          {filteredBacklog.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={<Check className="size-6" />}
                title={t('plannerBacklogEmptyTitle')}
                description={t('plannerBacklogEmptyDesc')}
              />
            </CardBody>
          ) : (
            <div className="divide-y divide-border/40">
              {filteredBacklog.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleBacklogDragStart(e, task)}
                  onDragEnd={handleBacklogDragEnd}
                  className={cn(
                    'group relative cursor-grab active:cursor-grabbing transition-all',
                    draggingBacklogTask?.id === task.id && 'opacity-40 border-dashed border-accent bg-accent/5',
                  )}
                >
                  <TaskRow
                    task={task}
                    project={task.projectId ? (projectNames?.get(task.projectId) ?? null) : null}
                    onToggle={async (tRow) => {
                      const next = await taskRepo.toggleComplete(tRow.id)
                      if (next?.status === 'completed') toast.success(t('toastCompleted', { title: next.title }))
                    }}
                    onOpen={() => setEditingTaskId(task.id)}
                    onEdit={() => setEditingTaskId(task.id)}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void scheduleSingle(task)
                    }}
                    title={t('plannerScheduleTooltip')}
                    className="absolute top-2.5 end-9 rounded-md border border-border bg-card px-1.5 py-1 text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent shadow-sm cursor-pointer"
                  >
                    {t('plannerPlanAction')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------- proposal preview -- */}
      <Modal
        open={proposal != null}
        onClose={() => setProposal(null)}
        title={t('plannerProposalTitle', { day: formatDayLabel(proposal?.day ?? day) })}
        description={
          proposal
            ? t('plannerProposalDesc', {
                items: proposal.items.length,
                total: formatDuration(proposal.totalMinutes),
                available: formatDuration(proposal.availableMinutes),
              })
            : undefined
        }
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setProposal(null)} disabled={applying}>
              {t('cCancel')}
            </Button>
            <Button variant="primary" onClick={() => void applyProposal()} disabled={applying}>
              <Sparkles className="size-4" />
              {applying ? t('plannerApplying') : t('plannerApplyChanges', { n: proposal?.items.length ?? 0 })}
            </Button>
          </>
        }
      >
        {proposal ? (
          <div className="flex flex-col gap-3">
            <div>
              {proposal.items.map((item) => (
                <div
                  key={item.taskId}
                  className="flex items-baseline gap-3 border-b border-border py-2 text-sm last:border-b-0"
                >
                  <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                    {formatMinutesOfDay(item.start)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{item.reason}</span>
                </div>
              ))}
            </div>
            {proposal.skipped.length > 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <h3 className="text-xs font-semibold text-amber-400">
                  {t('plannerNotScheduledTitle', { n: proposal.skipped.length })}
                </h3>
                <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                  {proposal.skipped.map((s) => (
                    <li key={s.taskId}>
                      <span className="font-medium text-foreground">{s.title}</span> — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* ----------------------------------------------- reschedule preview -- */}
      <Modal
        open={reschedulePlan != null}
        onClose={() => setReschedulePlan(null)}
        title={reschedulePlan?.label ?? ''}
        description={reschedulePlan?.description}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReschedulePlan(null)} disabled={applying}>
              {t('cCancel')}
            </Button>
            <Button variant="primary" onClick={() => void applyReschedule()} disabled={applying}>
              <CalendarPlus className="size-4" />
              {applying ? t('plannerApplying') : t('plannerApplyMoves')}
            </Button>
          </>
        }
      >
        {reschedulePlan ? (
          <div className="flex flex-col gap-2">
            {reschedulePlan.actions.map((action) => (
              <div key={action.taskId} className="flex items-baseline gap-3 border-b border-border py-2 text-sm last:border-b-0">
                <span className="min-w-0 flex-1 truncate font-medium">{action.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatMinutesOfDay(action.fromStart ?? 0)} →{' '}
                  {formatDayLabel(action.toDay)} {formatMinutesOfDay(action.toStart)}
                </span>
              </div>
            ))}
            {reschedulePlan.protectedTasks.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('plannerProtected', {
                  tasks: reschedulePlan.protectedTasks.map((pt) => pt.title).join(', '),
                })}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* ------------------------------------------------ task editor modal -- */}
      <TaskEditorModal
        taskId={editingTaskId}
        open={editingTaskId != null}
        onClose={() => setEditingTaskId(null)}
      />

      {/* ------------------------------------------------ quick add dialog -- */}
      <QuickAddDialog
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        defaultStartDate={quickAddStartDate}
      />
    </>
  )
}
