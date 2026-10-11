import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bell,
  Brain,
  Check,
  CheckCircle2,
  Coffee,
  ExternalLink,
  Flame,
  Inbox,
  Lightbulb,
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Timer as TimerIcon,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ColorDot,
  Field,
  Modal,
  OptionSelect,
  PageHeader,
  SegmentedControl,
  StatTile,
  Toggle,
  toast,
} from '@/components/ui'
import { useT } from '@/i18n'
import type { AmbientSoundType } from '@/services/ambientAudio'
import { pipTimer } from '@/services/pipTimer'
import { activityStreak } from '@/services/streaks'
import { projectRepo } from '@/storage/projectRepo'
import { taskRepo } from '@/storage/taskRepo'
import { focusRepo } from '@/storage/timeRepo'
import { getPhaseMinutes, useFocusStore } from '@/stores/focusStore'
import { useSettings, useWorkspaceId } from '@/stores/workspace'
import type { DayKey } from '@/types'
import { cn } from '@/utils/cn'
import { formatDuration, formatTimer, toDayKey } from '@/utils/date'

/**
 * Supercharged Deep-Work & Focus Engine.
 * Fully internationalized and synchronized with global focusStore
 * to prevent timer freeze or reset upon page navigation.
 */

export function FocusPage() {
  const t = useT()
  const workspaceId = useWorkspaceId()
  const settings = useSettings()

  const [searchParams] = useSearchParams()
  const [todayMinutes, setTodayMinutes] = useState(0)

  // Local input states
  const [desktopNotifications, setDesktopNotifications] = useState(
    typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted',
  )
  const [brainDumpText, setBrainDumpText] = useState('')
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')

  // Global persistent Focus Engine
  const {
    mode,
    phase,
    cycle,
    running,
    elapsedSeconds,
    interruptions,
    taskId,
    countdownMinutes,
    sound,
    ambientType,
    ambientVolume,
    ambientWhileRunningOnly,
    pipActive,
    zenMode,
    reflectionOpen,
    reflectionSessionInfo,
    sessionCapturedIdeas,
    setMode,
    setTaskId,
    setCountdownMinutes,
    setSound,
    setAmbientType,
    setAmbientVolume,
    setAmbientWhileRunningOnly,
    setPipActive,
    setZenMode,
    setReflectionOpen,
    addCapturedIdea,
    syncContext,
    start,
    pause,
    stop,
    advancePomodoro,
    reset,
  } = useFocusStore()

  useEffect(() => {
    syncContext(workspaceId, settings)
  }, [workspaceId, settings, syncContext])

  // Subscriptions
  const openTasks =
    useLiveQuery(
      () => taskRepo.list(workspaceId, { status: ['inbox', 'planned', 'in_progress', 'blocked'] }),
      [workspaceId],
    ) ?? []

  const projects = useLiveQuery(() => projectRepo.list(workspaceId), [workspaceId]) ?? []
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const todaySessions =
    useLiveQuery(
      () => focusRepo.forDay(workspaceId, toDayKey(new Date())),
      [workspaceId],
    ) ?? []

  const allWorkspaceSessions =
    useLiveQuery(() => focusRepo.forWorkspace(workspaceId), [workspaceId]) ?? []

  const subtasks =
    useLiveQuery(
      () => (taskId ? taskRepo.subtasks(workspaceId, taskId) : []),
      [workspaceId, taskId],
    ) ?? []

  const focusStreak = useMemo(() => {
    const days = new Set<DayKey>(
      allWorkspaceSessions.filter((s) => s.duration > 0).map((s) => s.day),
    )
    return activityStreak(days)
  }, [allWorkspaceSessions])

  useEffect(() => {
    setTodayMinutes(todaySessions.reduce((acc, s) => acc + s.duration, 0))
  }, [todaySessions])

  const taskById = useMemo(() => new Map(openTasks.map((tk) => [tk.id, tk])), [openTasks])
  const activeTask = taskId ? (taskById.get(taskId) ?? null) : null
  const activeProject = activeTask?.projectId ? projectById.get(activeTask.projectId) : null

  // URL param task deep-link initialization
  useEffect(() => {
    const qTask = searchParams.get('task')
    if (qTask && !taskId) {
      const match = taskById.get(qTask)
      setTaskId(qTask, match?.title ?? '')
    }
  }, [searchParams, taskId, taskById, setTaskId])

  // Sync task title whenever activeTask updates
  useEffect(() => {
    if (activeTask && taskId) {
      setTaskId(activeTask.id, activeTask.title)
    }
  }, [activeTask, taskId, setTaskId])

  // Calculated remaining time & progress ring
  const totalSeconds = getPhaseMinutes(mode, phase, countdownMinutes, settings.pomodoro) * 60
  const remaining = mode === 'stopwatch' ? elapsedSeconds : Math.max(0, totalSeconds - elapsedSeconds)
  const isBreak = phase !== 'work'

  const phaseLabel =
    mode === 'stopwatch'
      ? t('focusModeStopwatch')
      : mode === 'countdown'
        ? t('focusModeCountdown')
        : phase === 'work'
          ? t('focusPhaseWork', { cycle })
          : phase === 'short_break'
            ? t('focusPhaseShortBreak')
            : t('focusPhaseLongBreak')

  // Sync PiP state listener
  useEffect(() => {
    pipTimer.setOnStateChange((active) => setPipActive(active))
  }, [setPipActive])

  // Keyboard Shortcuts Listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      if (e.code === 'Space') {
        e.preventDefault()
        if (!running && elapsedSeconds === 0) {
          start(workspaceId, settings)
        } else {
          pause()
        }
      } else if (e.code === 'KeyS' && mode === 'pomodoro') {
        e.preventDefault()
        void advancePomodoro(workspaceId, settings)
      } else if (e.code === 'KeyF') {
        e.preventDefault()
        setZenMode(!zenMode)
      } else if (e.code === 'Escape') {
        if (zenMode) {
          e.preventDefault()
          setZenMode(false)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [running, elapsedSeconds, mode, workspaceId, settings, start, pause, advancePomodoro, zenMode, setZenMode])

  // Subtask quick add
  async function handleAddSubtask(e: React.FormEvent) {
    e.preventDefault()
    if (!newSubtaskTitle.trim() || !taskId) return
    await taskRepo.create(workspaceId, {
      parentTaskId: taskId,
      title: newSubtaskTitle.trim(),
      status: 'inbox',
      priority: 'medium',
    })
    setNewSubtaskTitle('')
    toast.success(t('focusToastSubtaskAdded'))
  }

  // Complete active task directly from Focus
  async function handleCompleteActiveTask() {
    if (!activeTask) return
    const next = await taskRepo.toggleComplete(activeTask.id)
    if (next?.status === 'completed') {
      toast.success(t('focusToastTaskCompleted', { title: next.title }))
    }
  }

  // Quick Brain Dump
  async function handleBrainDump(e: React.FormEvent) {
    e.preventDefault()
    if (!brainDumpText.trim()) return
    const created = await taskRepo.create(workspaceId, {
      title: brainDumpText.trim(),
      status: 'inbox',
      priority: 'medium',
    })
    addCapturedIdea({
      id: created.id,
      title: created.title,
      time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    })
    toast.success(t('focusBrainDumpToast'))
    setBrainDumpText('')
  }

  // Picture-in-Picture Toggle
  async function handleTogglePip() {
    const timeStr = formatTimer(remaining)
    const taskName = activeTask?.title ?? t('focusTitle')
    const next = await pipTimer.toggle(timeStr, taskName, phaseLabel, isBreak, running)
    setPipActive(next)
  }

  // Request Desktop Notification Permission
  async function handleRequestNotifications() {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    const res = await Notification.requestPermission()
    if (res === 'granted') {
      setDesktopNotifications(true)
      toast.success(t('focusNotifGranted'))
    } else {
      toast.info(t('focusNotifDenied'))
    }
  }

  // Circular SVG Math
  const ringPct =
    mode === 'stopwatch' ? 0 : Math.min(100, (elapsedSeconds / Math.max(1, totalSeconds)) * 100)
  const radius = 116
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset =
    mode === 'stopwatch' ? 0 : Math.max(0, circumference * (1 - ringPct / 100))

  return (
    <>
      <PageHeader
        title={t('focusTitle')}
        description={t('focusDesc')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {pipTimer.isSupported() ? (
              <Button
                variant={pipActive ? 'primary' : 'outline'}
                size="sm"
                onClick={() => void handleTogglePip()}
                title={t('focusPipTitle')}
              >
                <PictureInPicture2 className="size-4" />
                <span className="hidden sm:inline">{t('focusFloatingPip')}</span>
              </Button>
            ) : null}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setZenMode(true)}
              title={t('focusZenModeTitle')}
            >
              <Maximize2 className="size-4 text-accent" />
              <span>{t('focusZenMode')}</span>
              <kbd className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono sm:inline">F</kbd>
            </Button>
          </div>
        }
      />

      {/* ------------------------------------------------ Top Stats Row -- */}
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatTile
          label={t('focusStatToday')}
          value={formatDuration(todayMinutes)}
          hint={t('focusStatTodayHint', { target: formatDuration(settings.planning.dailyFocusTarget) })}
          tone={
            todayMinutes >= settings.planning.dailyFocusTarget
              ? 'positive'
              : todayMinutes > 0
                ? 'accent'
                : 'default'
          }
          icon={<Brain className="size-4" />}
        />
        <StatTile
          label={t('focusStatStreak')}
          value={`${focusStreak.current}d`}
          hint={t('focusStatStreakHint', { longest: focusStreak.longest })}
          tone={focusStreak.current > 0 ? 'accent' : 'default'}
          icon={<Flame className="size-4 text-amber-500" />}
        />
        <StatTile
          label={t('focusStatSessions')}
          value={todaySessions.length}
          hint={t('focusStatSessionsHint')}
          icon={<Coffee className="size-4" />}
        />
        <StatTile
          label={t('focusStatInterruptions')}
          value={interruptions}
          hint={t('focusStatInterruptionsHint')}
          tone={interruptions > 2 ? 'warning' : 'default'}
        />
      </div>

      {/* ------------------------------------------------ Main Grid -- */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Left Column: Primary Focus Arena */}
        <Card className="flex flex-col items-center justify-center p-6 sm:p-8">
          <SegmentedControl
            value={mode}
            options={[
              { value: 'pomodoro', label: t('focusModePomodoro') },
              { value: 'countdown', label: t('focusModeCountdown') },
              { value: 'stopwatch', label: t('focusModeStopwatch') },
            ]}
            onChange={(m) => setMode(m)}
            size="md"
          />

          {/* Glowing Circular SVG Timer */}
          <div className="relative my-6 flex items-center justify-center">
            <svg
              className="size-72 -rotate-90 transform drop-shadow-md sm:size-80"
              viewBox="0 0 280 280"
            >
              <defs>
                <linearGradient id="focusWorkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
                <linearGradient id="focusBreakGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
                <filter id="focusGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Background Track */}
              <circle
                cx="140"
                cy="140"
                r={radius}
                className="stroke-muted/40"
                strokeWidth="9"
                fill="none"
              />

              {/* Animated Progress Stroke */}
              <circle
                cx="140"
                cy="140"
                r={radius}
                stroke={isBreak ? 'url(#focusBreakGrad)' : 'url(#focusWorkGrad)'}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                filter="url(#focusGlow)"
                fill="none"
                className="transition-[stroke-dashoffset] duration-700 ease-out"
              />
            </svg>

            {/* Inner Center Display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <Badge
                className={cn(
                  'mb-2 px-2.5 py-0.5 text-xs font-semibold',
                  isBreak
                    ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                    : 'border-accent/30 bg-accent/15 text-accent',
                )}
              >
                {phaseLabel}
              </Badge>

              <div
                className={cn(
                  'font-bold tracking-tight tabular-nums transition-colors',
                  isBreak ? 'text-emerald-400' : 'text-foreground',
                )}
                style={{ fontSize: 64, lineHeight: 1 }}
              >
                {mode === 'stopwatch' ? formatTimer(elapsedSeconds) : formatTimer(remaining)}
              </div>

              {activeTask ? (
                <div className="mt-2 flex max-w-[200px] items-center gap-1.5 truncate text-xs text-muted-foreground">
                  {activeProject ? <ColorDot color={activeProject.color} size="sm" /> : null}
                  <span className="truncate font-medium">{activeTask.title}</span>
                </div>
              ) : (
                <span className="mt-2 text-xs text-muted-foreground">{t('focusGeneralSession')}</span>
              )}

              {running ? (
                <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                  <span className="size-1.5 animate-ping rounded-full bg-emerald-400" />
                  {t('focusStatusRunning')}
                </span>
              ) : elapsedSeconds > 0 ? (
                <span className="mt-1 text-[11px] font-medium text-amber-400">{t('focusStatusPaused')}</span>
              ) : null}
            </div>
          </div>

          {/* Primary Controls */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {!running && elapsedSeconds === 0 ? (
              <Button
                variant="primary"
                size="lg"
                onClick={() => start(workspaceId, settings)}
                className="px-6 shadow-md"
              >
                <Play className="size-4" />
                {t('focusStart')}
              </Button>
            ) : (
              <Button
                variant={running ? 'secondary' : 'primary'}
                size="lg"
                onClick={pause}
                className="px-6"
              >
                {running ? <Pause className="size-4" /> : <Play className="size-4" />}
                {running ? t('focusPause') : t('focusResume')}
              </Button>
            )}

            {mode === 'pomodoro' ? (
              <Button
                variant="outline"
                size="lg"
                onClick={() => void advancePomodoro(workspaceId, settings)}
                disabled={!running && elapsedSeconds === 0}
                title={`${t('focusSkipInterval')} (S)`}
              >
                {t('focusSkipInterval')}
              </Button>
            ) : null}

            {activeTask && activeTask.status !== 'completed' ? (
              <Button
                variant="outline"
                size="lg"
                onClick={() => void handleCompleteActiveTask()}
                title={t('focusCompleteTask')}
                className="text-emerald-500 hover:text-emerald-400"
              >
                <CheckCircle2 className="size-4" />
                {t('focusCompleteTask')}
              </Button>
            ) : null}

            <Button
              variant="outline"
              size="lg"
              onClick={() => void stop(workspaceId, settings)}
              disabled={elapsedSeconds === 0}
            >
              <Square className="size-4" />
              {t('focusSaveAndStop')}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              aria-label={t('focusReset')}
              onClick={reset}
              disabled={elapsedSeconds === 0 && !running}
            >
              <RotateCcw className="size-4" />
            </Button>
          </div>

          {/* Ergonomic Keyboard Shortcut Hints */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-[11px] text-muted-foreground select-none">
            <span>
              <kbd className="rounded border border-border bg-muted/60 px-1 py-0.5 font-mono">Space</kbd> {t('focusShortcutSpace')}
            </span>
            {mode === 'pomodoro' ? (
              <span>
                <kbd className="rounded border border-border bg-muted/60 px-1 py-0.5 font-mono">S</kbd> {t('focusShortcutSkip')}
              </span>
            ) : null}
            <span>
              <kbd className="rounded border border-border bg-muted/60 px-1 py-0.5 font-mono">F</kbd> {t('focusShortcutZen')}
            </span>
            <span>
              <kbd className="rounded border border-border bg-muted/60 px-1 py-0.5 font-mono">Esc</kbd> {t('focusShortcutExit')}
            </span>
          </div>

          {/* -------------------------------- Ambient Audio Soundscapes -------------------------------- */}
          <div className="mt-6 w-full max-w-lg rounded-xl border border-border/80 bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Volume2 className="size-4 text-accent" />
                <span className="text-xs font-semibold">{t('focusAmbientTitle')}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={ambientVolume}
                  onChange={(e) => setAmbientVolume(Number(e.target.value))}
                  className="h-1.5 w-20 accent-accent cursor-pointer"
                  title={t('focusAmbientVolume')}
                />
                <span className="w-8 text-end text-[10px] tabular-nums text-muted-foreground">
                  {Math.round(ambientVolume * 100)}%
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {(
                [
                  { type: 'none', label: t('focusAmbientOff'), icon: VolumeX },
                  { type: 'white', label: t('focusAmbientWhite') },
                  { type: 'pink', label: t('focusAmbientRain') },
                  { type: 'brown', label: t('focusAmbientBrown') },
                  { type: 'binaural', label: t('focusAmbientBinaural') },
                ] as const
              ).map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => {
                    const next = item.type as AmbientSoundType
                    setAmbientType(next)
                  }}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                    ambientType === item.type
                      ? 'border-accent bg-accent/15 text-accent font-semibold shadow-sm'
                      : 'border-border/60 bg-card/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                  )}
                >
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{t('focusAmbientWhileRunning')}</span>
              <Toggle
                checked={ambientWhileRunningOnly}
                onChange={setAmbientWhileRunningOnly}
                label=""
              />
            </div>
          </div>

          {/* -------------------------------- Quick Brain Dump -------------------------------- */}
          <div className="mt-4 w-full max-w-lg rounded-xl border border-dashed border-border bg-card/60 p-3.5 shadow-xs">
            <form onSubmit={(e) => void handleBrainDump(e)}>
              <div className="flex items-center gap-2">
                <Lightbulb className="size-4 shrink-0 text-amber-400" />
                <input
                  type="text"
                  value={brainDumpText}
                  onChange={(e) => setBrainDumpText(e.target.value)}
                  placeholder={t('focusBrainDumpPlaceholder')}
                  className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <Button variant="ghost" size="sm" type="submit" disabled={!brainDumpText.trim()}>
                  <Plus className="size-3.5" />
                  {t('focusBrainDumpSubmit')}
                </Button>
              </div>
            </form>

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
              <span>{t('focusBrainDumpHelpHint')}</span>
              <Link
                to="/tasks?filter=inbox"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
              >
                <Inbox className="size-3.5" />
                <span>{t('focusBrainDumpViewInbox')}</span>
                <ExternalLink className="size-3" />
              </Link>
            </div>

            {sessionCapturedIdeas.length > 0 ? (
              <div className="mt-2.5 space-y-1.5 border-t border-border/40 pt-2">
                <div className="text-[11px] font-semibold text-foreground">
                  {t('focusBrainDumpSessionIdeas')} ({sessionCapturedIdeas.length}):
                </div>
                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                  {sessionCapturedIdeas.map((idea) => (
                    <span
                      key={idea.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-background/90 px-2 py-0.5 text-xs text-foreground shadow-xs"
                    >
                      <span className="size-1.5 rounded-full bg-amber-400" />
                      <span>{idea.title}</span>
                      <span className="text-[10px] text-muted-foreground">{idea.time}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        {/* Right Column: Task Details, Subtasks, Settings & History */}
        <div className="flex flex-col gap-4">
          {/* Active Task & Subtasks Card */}
          <Card>
            <CardHeader
              title={t('focusSessionTaskTitle')}
              description={t('focusSessionTaskDesc')}
              icon={<TimerIcon className="size-4" />}
            />
            <CardBody className="flex flex-col gap-3">
              <Field label={t('focusWorkingOn')} htmlFor="focus-task">
                <OptionSelect
                  id="focus-task"
                  value={taskId}
                  placeholder={t('focusNoSpecificTask')}
                  onChange={(tId) => {
                    const found = taskById.get(tId)
                    setTaskId(tId, found?.title ?? '')
                  }}
                  options={openTasks.map((tRow) => ({ value: tRow.id, label: tRow.title }))}
                />
              </Field>

              {activeTask ? (
                <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      {t('focusSubtasksTitle')} ({subtasks.filter((s) => s.status === 'completed').length}/{subtasks.length})
                    </span>
                    {activeProject ? (
                      <Badge className="text-[10px]">
                        <ColorDot color={activeProject.color} size="sm" className="me-1" />
                        {activeProject.name}
                      </Badge>
                    ) : null}
                  </div>

                  {/* Subtask items */}
                  <div className="mt-2 space-y-1.5">
                    {subtasks.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">{t('focusNoSubtasks')}</p>
                    ) : (
                      subtasks.map((sub) => (
                        <div
                          key={sub.id}
                          className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={sub.status === 'completed'}
                            onChange={() => void taskRepo.toggleComplete(sub.id)}
                          />
                          <span
                            className={cn(
                              'truncate',
                              sub.status === 'completed' && 'line-through text-muted-foreground opacity-70',
                            )}
                          >
                            {sub.title}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add subtask inline */}
                  <form onSubmit={(e) => void handleAddSubtask(e)} className="mt-2 flex gap-1.5">
                    <input
                      type="text"
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      placeholder={t('focusAddSubtaskPlaceholder')}
                      className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs focus:border-accent focus:outline-none"
                    />
                    <Button variant="ghost" size="sm" type="submit" disabled={!newSubtaskTitle.trim()} className="h-7 px-2">
                      <Plus className="size-3" />
                    </Button>
                  </form>
                </div>
              ) : null}

              {mode === 'countdown' ? (
                <Field label={t('focusCountdownLength')}>
                  <input
                    type="number"
                    min={5}
                    max={240}
                    step={5}
                    value={countdownMinutes}
                    disabled={running || elapsedSeconds > 0}
                    onChange={(e) => setCountdownMinutes(Math.max(5, Number(e.target.value) || 25))}
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-accent focus:outline-none disabled:opacity-50"
                  />
                </Field>
              ) : null}

              <div className="space-y-2 border-t border-border/60 pt-2">
                <Toggle
                  checked={sound}
                  onChange={setSound}
                  label={t('focusChimeToggle')}
                  description={t('focusChimeDesc')}
                />

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <div className="text-xs font-medium">{t('focusDesktopNotifs')}</div>
                    <div className="text-[11px] text-muted-foreground">{t('focusDesktopNotifsDesc')}</div>
                  </div>
                  {desktopNotifications ? (
                    <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                      <Check className="size-3 me-1" /> {t('focusDesktopNotifsActive')}
                    </Badge>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => void handleRequestNotifications()}>
                      <Bell className="size-3.5" /> {t('focusDesktopNotifsEnable')}
                    </Button>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Today's Sessions Card */}
          <Card>
            <CardHeader
              title={t('focusTodaySessionsTitle')}
              description={t('focusTodaySessionsCount', { count: todaySessions.length, duration: formatDuration(todayMinutes) })}
            />
            {todaySessions.length === 0 ? (
              <CardBody>
                <p className="text-sm text-muted-foreground">
                  {t('focusTodaySessionsEmpty')}
                </p>
              </CardBody>
            ) : (
              <div className="max-h-72 divide-y divide-border overflow-y-auto">
                {todaySessions.map((session) => (
                  <div key={session.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-full',
                        session.completed ? 'bg-emerald-500/15 text-emerald-400' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {session.completed ? <Check className="size-3.5" /> : <Square className="size-3" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">
                        {session.taskId ? (taskById.get(session.taskId)?.title ?? t('focusDeletedTask')) : t('focusGeneralSession')}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(session.startTime).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {session.mode.replace('_', ' ')}
                        {session.pomodoroCycle ? ` · cycle ${session.pomodoroCycle}` : ''}
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {formatDuration(session.duration)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* ----------------------- DISTRACTION-FREE ZEN MODE ----------------- */}
      {/* ------------------------------------------------------------------ */}
      {zenMode ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-between overflow-y-auto bg-background/98 p-6 backdrop-blur-2xl transition-all sm:p-10">
          {/* Zen Top Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className="border-accent/40 bg-accent/15 px-3 py-1 text-xs text-accent">
                <Sparkles className="size-3 me-1.5" /> {t('focusZenMode')}
              </Badge>
              {focusStreak.current > 0 ? (
                <Badge className="border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-400">
                  <Flame className="size-3.5 me-1" /> {focusStreak.current}d Streak
                </Badge>
              ) : null}
            </div>

            {/* Quick Ambient in Zen */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-border bg-card/80 px-2.5 py-1">
                <Volume2 className="size-3.5 text-accent" />
                <select
                  value={ambientType}
                  onChange={(e) => {
                    const next = e.target.value as AmbientSoundType
                    setAmbientType(next)
                  }}
                  className="bg-transparent text-xs text-foreground outline-none cursor-pointer"
                >
                  <option value="none" className="bg-card">{t('focusAmbientOff')}</option>
                  <option value="white" className="bg-card">{t('focusAmbientWhite')}</option>
                  <option value="pink" className="bg-card">{t('focusAmbientRain')}</option>
                  <option value="brown" className="bg-card">{t('focusAmbientBrown')}</option>
                  <option value="binaural" className="bg-card">{t('focusAmbientBinaural')}</option>
                </select>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={ambientVolume}
                  onChange={(e) => setAmbientVolume(Number(e.target.value))}
                  className="h-1.5 w-16 accent-accent"
                />
              </div>

              <Button variant="ghost" size="sm" onClick={() => setZenMode(false)}>
                <Minimize2 className="size-4" />
                <span>{t('focusExitZen')}</span>
              </Button>
            </div>
          </div>

          {/* Zen Center Display */}
          <div className="my-auto flex flex-col items-center justify-center text-center">
            {activeTask ? (
              <div className="mb-4 flex flex-col items-center">
                {activeProject ? (
                  <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <ColorDot color={activeProject.color} size="sm" />
                    <span>{activeProject.name}</span>
                  </div>
                ) : null}
                <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {activeTask.title}
                </h1>
              </div>
            ) : null}

            {/* Huge Glowing Circle in Zen */}
            <div className="relative my-4 flex items-center justify-center">
              <svg className="size-80 -rotate-90 transform drop-shadow-2xl sm:size-96" viewBox="0 0 280 280">
                <circle cx="140" cy="140" r={radius} className="stroke-muted/30" strokeWidth="8" fill="none" />
                <circle
                  cx="140"
                  cy="140"
                  r={radius}
                  stroke={isBreak ? 'url(#focusBreakGrad)' : 'url(#focusWorkGrad)'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  filter="url(#focusGlow)"
                  fill="none"
                  className="transition-[stroke-dashoffset] duration-700 ease-out"
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Badge
                  className={cn(
                    'mb-3 px-3 py-0.5 text-xs font-semibold',
                    isBreak
                      ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                      : 'border-accent/30 bg-accent/15 text-accent',
                  )}
                >
                  {phaseLabel}
                </Badge>

                <div
                  className={cn(
                    'font-bold tracking-tight tabular-nums transition-colors',
                    isBreak ? 'text-emerald-400' : 'text-foreground',
                  )}
                  style={{ fontSize: 78, lineHeight: 1 }}
                >
                  {mode === 'stopwatch' ? formatTimer(elapsedSeconds) : formatTimer(remaining)}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  {running ? (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                      <span className="size-2 animate-ping rounded-full bg-emerald-400" />
                      {t('focusStatusRunning')}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t('focusStatusPaused')}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Zen Controls */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button
                variant={running ? 'secondary' : 'primary'}
                size="lg"
                onClick={() => (running ? pause() : start(workspaceId, settings))}
                className="px-8 shadow-lg"
              >
                {running ? <Pause className="size-5" /> : <Play className="size-5" />}
                {running ? t('focusPause') : t('focusStart')}
              </Button>

              {mode === 'pomodoro' ? (
                <Button variant="outline" size="lg" onClick={() => void advancePomodoro(workspaceId, settings)}>
                  {t('focusSkipInterval')}
                </Button>
              ) : null}

              {activeTask && activeTask.status !== 'completed' ? (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => void handleCompleteActiveTask()}
                  className="text-emerald-500 hover:text-emerald-400"
                >
                  <CheckCircle2 className="size-5" />
                  {t('focusCompleteTask')}
                </Button>
              ) : null}

              <Button
                variant="outline"
                size="lg"
                onClick={() => void stop(workspaceId, settings)}
                disabled={elapsedSeconds === 0}
              >
                <Square className="size-5" />
                {t('focusSaveAndStop')}
              </Button>
            </div>

            {/* Subtasks in Zen */}
            {activeTask && subtasks.length > 0 ? (
              <div className="mt-8 max-w-md w-full rounded-xl border border-border/80 bg-card/60 p-3 text-start">
                <div className="mb-2 text-xs font-semibold text-muted-foreground">
                  {t('focusZenSubtasks')} ({subtasks.filter((s) => s.status === 'completed').length}/{subtasks.length}):
                </div>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {subtasks.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs">
                      <Checkbox
                        checked={sub.status === 'completed'}
                        onChange={() => void taskRepo.toggleComplete(sub.id)}
                      />
                      <span className={cn(sub.status === 'completed' && 'line-through opacity-60')}>
                        {sub.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Zen Bottom Bar */}
          <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-3">
            <form onSubmit={(e) => void handleBrainDump(e)} className="w-full">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-card/80 px-3 py-2 shadow-sm">
                <Lightbulb className="size-4 shrink-0 text-amber-400" />
                <input
                  type="text"
                  value={brainDumpText}
                  onChange={(e) => setBrainDumpText(e.target.value)}
                  placeholder={t('focusBrainDumpPlaceholder')}
                  className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <Button variant="ghost" size="sm" type="submit" disabled={!brainDumpText.trim()}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </form>

            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span>[Space] {t('focusShortcutSpace')}</span>
              <span>[S] {t('focusShortcutSkip')}</span>
              <span>[Esc / F] {t('focusShortcutExit')}</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* ------------------ POST-SESSION REFLECTION MODAL ----------------- */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={reflectionOpen}
        onClose={() => setReflectionOpen(false)}
        title={t('focusReflectionTitle')}
        size="md"
        footer={
          <Button variant="primary" onClick={() => setReflectionOpen(false)}>
            {t('focusReflectionDone')}
          </Button>
        }
      >
        <div className="flex flex-col gap-4 text-center">
          <p className="text-sm text-muted-foreground">
            {t('focusReflectionDesc', {
              duration: formatDuration(reflectionSessionInfo?.duration ?? 0),
              task: reflectionSessionInfo?.taskTitle ?? '',
            })}
          </p>

          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => {
                toast.success(t('focusReflectionToastDeep'))
                setReflectionOpen(false)
              }}
              className="flex flex-col items-center gap-2 rounded-xl border border-border p-3 transition-colors hover:border-accent hover:bg-accent/10"
            >
              <span className="text-2xl">🚀</span>
              <span className="text-xs font-semibold">{t('focusRatingDeep')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                toast.success(t('focusReflectionToastSteady'))
                setReflectionOpen(false)
              }}
              className="flex flex-col items-center gap-2 rounded-xl border border-border p-3 transition-colors hover:border-accent hover:bg-accent/10"
            >
              <span className="text-2xl">👍</span>
              <span className="text-xs font-semibold">{t('focusRatingSteady')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                toast.info(t('focusReflectionToastDistracted'))
                setReflectionOpen(false)
              }}
              className="flex flex-col items-center gap-2 rounded-xl border border-border p-3 transition-colors hover:border-accent hover:bg-accent/10"
            >
              <span className="text-2xl">⚡</span>
              <span className="text-xs font-semibold">{t('focusRatingDistracted')}</span>
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
