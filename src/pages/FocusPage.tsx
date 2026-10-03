import { useLiveQuery } from 'dexie-react-hooks'
import {
  Brain,
  Check,
  Coffee,
  Pause,
  Play,
  RotateCcw,
  Square,
  Timer as TimerIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  OptionSelect,
  PageHeader,
  SegmentedControl,
  StatTile,
  Toggle,
  toast,
} from '@/components/ui'
import { focusRepo } from '@/storage/timeRepo'
import { taskRepo } from '@/storage/taskRepo'
import { useSettings, useWorkspaceId } from '@/stores/workspace'
import type { FocusMode } from '@/types'
import { cn } from '@/utils/cn'
import { formatDuration, formatTimer, toDayKey } from '@/utils/date'

/**
 * Focus timer.
 *
 * Three modes over one engine:
 *  - pomodoro: work/break cycles from workspace settings, auto-advancing,
 *  - countdown: a fixed length session for one task,
 *  - stopwatch: open-ended, saved whenever stopped.
 *
 * A completed interval is persisted through `focusRepo.save`, which also writes
 * the matching time entry, so focus work lands in the score and the task's
 * actual duration without a second manual step.
 */
export function FocusPage() {
  const workspaceId = useWorkspaceId()
  const settings = useSettings()
  const pomodoro = settings.pomodoro

  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<FocusMode>('pomodoro')
  const [phase, setPhase] = useState<'work' | 'short_break' | 'long_break'>('work')
  const [cycle, setCycle] = useState(1)
  const [running, setRunning] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [interruptions, setInterruptions] = useState(0)
  const [taskId, setTaskId] = useState<string>(searchParams.get('task') ?? '')
  const [countdownMinutes, setCountdownMinutes] = useState(50)
  const [sound, setSound] = useState(pomodoro.soundEnabled)
  const [todayMinutes, setTodayMinutes] = useState(0)

  const startStampRef = useRef<Date | null>(null)
  const timerRef = useRef<number | null>(null)

  const openTasks =
    useLiveQuery(
      () => taskRepo.list(workspaceId, { status: ['inbox', 'planned', 'in_progress', 'blocked'] }),
      [workspaceId],
    ) ?? []
  const todaySessions =
    useLiveQuery(
      () => focusRepo.forDay(workspaceId, toDayKey(new Date())),
      [workspaceId],
    ) ?? []

  useEffect(() => {
    setTodayMinutes(todaySessions.reduce((acc, s) => acc + s.duration, 0))
  }, [todaySessions])

  const taskById = useMemo(() => new Map(openTasks.map((t) => [t.id, t])), [openTasks])
  const activeTask = taskId ? (taskById.get(taskId) ?? null) : null

  const phaseMinutes = useCallback(
    (p: 'work' | 'short_break' | 'long_break') => {
      switch (p) {
        case 'work':
          return mode === 'countdown' ? countdownMinutes : pomodoro.workMinutes
        case 'short_break':
          return pomodoro.shortBreakMinutes
        case 'long_break':
          return pomodoro.longBreakMinutes
      }
    },
    [mode, countdownMinutes, pomodoro],
  )

  const totalSeconds = phaseMinutes(phase) * 60
  const remaining = mode === 'stopwatch' ? elapsedSeconds : Math.max(0, totalSeconds - elapsedSeconds)

  function chime() {
    if (!sound) return
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.08, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2)
      osc.start()
      osc.stop(ctx.currentTime + 1.2)
      setTimeout(() => void ctx.close(), 1500)
    } catch {
      // Audio is a nicety; never let it break a session.
    }
  }

  const saveSession = useCallback(
    async (opts: { completed: boolean }) => {
      const start = startStampRef.current
      startStampRef.current = null
      if (!start) return
      const focusedMinutes = Math.round(elapsedSeconds / 60)
      if (focusedMinutes < 1 && !opts.completed) {
        // Abandoned within the first minute — not worth a ledger row.
        return
      }
      await focusRepo.save({
        workspaceId,
        taskId: taskId || null,
        start,
        end: new Date(),
        mode,
        plannedDuration: phaseMinutes('work'),
        focusedMinutes,
        pomodoroCycle: mode === 'pomodoro' && phase === 'work' ? cycle : null,
        completed: opts.completed,
        interruptions,
      })
      if (focusedMinutes >= 1) {
        toast.success(
          `${focusedMinutes}m of focus saved${activeTask ? ` on “${activeTask.title}”` : ''}`,
        )
      }
      setInterruptions(0)
    },
    [elapsedSeconds, workspaceId, taskId, mode, phase, cycle, interruptions, activeTask, phaseMinutes],
  )

  const advancePomodoro = useCallback(async () => {
    await saveSession({ completed: phase === 'work' })
    chime()
    if (phase === 'work') {
      const isLong = cycle % Math.max(1, pomodoro.cyclesBeforeLongBreak) === 0
      setPhase(isLong ? 'long_break' : 'short_break')
      setElapsedSeconds(0)
      if (pomodoro.autoStartBreaks) {
        startStampRef.current = new Date()
        setRunning(true)
      } else {
        setRunning(false)
      }
    } else {
      setPhase('work')
      setCycle((c) => c + 1)
      setElapsedSeconds(0)
      if (pomodoro.autoStartNextWork) {
        startStampRef.current = new Date()
        setRunning(true)
      } else {
        setRunning(false)
      }
    }
    // `chime` reads only refs/state it is allowed to see stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveSession, phase, cycle, pomodoro.autoStartBreaks, pomodoro.autoStartNextWork, pomodoro.cyclesBeforeLongBreak])

  useEffect(() => {
    if (!running) return
    timerRef.current = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1)
    }, 1000)
    return () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current)
    }
  }, [running])

  // Natural completion of pomodoro / countdown intervals.
  useEffect(() => {
    if (!running) return
    if (mode !== 'stopwatch' && elapsedSeconds >= totalSeconds) {
      if (mode === 'countdown') {
        void saveSession({ completed: true })
        chime()
        setRunning(false)
        setElapsedSeconds(0)
        startStampRef.current = null
      } else {
        void advancePomodoro()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedSeconds, running, mode, totalSeconds])

  function start() {
    startStampRef.current = new Date()
    setElapsedSeconds(0)
    setRunning(true)
  }

  async function stop() {
    setRunning(false)
    await saveSession({ completed: false })
    setElapsedSeconds(0)
  }

  async function pause() {
    if (running) {
      setRunning(false)
      setInterruptions((n) => n + 1)
    } else {
      startStampRef.current = new Date(Date.now() - elapsedSeconds * 1000)
      setRunning(true)
    }
  }

  function reset() {
    setRunning(false)
    setElapsedSeconds(0)
    startStampRef.current = null
    setInterruptions(0)
  }

  const ringPct =
    mode === 'stopwatch' ? 0 : Math.min(100, (elapsedSeconds / Math.max(1, totalSeconds)) * 100)
  const phaseLabel =
    mode === 'stopwatch'
      ? 'Stopwatch'
      : mode === 'countdown'
        ? 'Countdown'
        : phase === 'work'
          ? `Work · cycle ${cycle}`
          : phase === 'short_break'
            ? 'Short break'
            : 'Long break'
  const isBreak = phase !== 'work'

  return (
    <>
      <PageHeader
        title="Focus"
        description="Deep-work sessions that feed the score automatically — no manual time entry."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatTile
          label="Focus today"
          value={formatDuration(todayMinutes)}
          hint={`Target ${formatDuration(settings.planning.dailyFocusTarget)}`}
          tone={
            todayMinutes >= settings.planning.dailyFocusTarget
              ? 'positive'
              : todayMinutes > 0
                ? 'accent'
                : 'default'
          }
          icon={<Brain className="size-4" />}
        />
        <StatTile label="Sessions today" value={todaySessions.length} hint="Completed or stopped" />
        <StatTile
          label="Pomodoro cycle"
          value={cycle}
          hint={`Long break every ${pomodoro.cyclesBeforeLongBreak}`}
          icon={<Coffee className="size-4" />}
        />
        <StatTile
          label="Interruptions"
          value={interruptions}
          hint="Pauses this session"
          tone={interruptions > 2 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="flex flex-col items-center justify-center p-8">
          <SegmentedControl
            value={mode}
            options={[
              { value: 'pomodoro', label: 'Pomodoro' },
              { value: 'countdown', label: 'Countdown' },
              { value: 'stopwatch', label: 'Stopwatch' },
            ]}
            onChange={(m) => {
              if (running) {
                toast.info('Stop the current session before switching modes.')
                return
              }
              setMode(m)
              setPhase('work')
              setElapsedSeconds(0)
            }}
            size="md"
          />

          <Badge className={cn('mt-4', isBreak && 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400')}>
            {phaseLabel}
          </Badge>

          <div
            className={cn(
              'mt-4 font-semibold tabular-nums',
              isBreak ? 'text-emerald-400' : 'text-accent',
            )}
            style={{ fontSize: 72, lineHeight: 1 }}
          >
            {mode === 'stopwatch' ? formatTimer(elapsedSeconds) : formatTimer(remaining)}
          </div>

          {mode !== 'stopwatch' ? (
            <div className="mt-3 h-1.5 w-64 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full transition-[width]', isBreak ? 'bg-emerald-400' : 'bg-accent')}
                style={{ width: `${ringPct}%` }}
              />
            </div>
          ) : null}

          <div className="mt-6 flex items-center gap-2">
            {!running && elapsedSeconds === 0 ? (
              <Button variant="primary" size="lg" onClick={start}>
                <Play className="size-4" />
                Start
              </Button>
            ) : (
              <Button variant={running ? 'secondary' : 'primary'} size="lg" onClick={() => void pause()}>
                {running ? <Pause className="size-4" /> : <Play className="size-4" />}
                {running ? 'Pause' : 'Resume'}
              </Button>
            )}
            {mode === 'pomodoro' ? (
              <Button variant="outline" size="lg" onClick={() => void advancePomodoro()} disabled={!running && elapsedSeconds === 0}>
                Skip interval
              </Button>
            ) : null}
            <Button variant="outline" size="lg" onClick={() => void stop()} disabled={elapsedSeconds === 0}>
              <Square className="size-4" />
              Save & stop
            </Button>
            <Button variant="ghost" size="icon" aria-label="Reset" onClick={reset} disabled={elapsedSeconds === 0 && !running}>
              <RotateCcw className="size-4" />
            </Button>
          </div>

          <p className="mt-4 max-w-sm text-center text-xs text-muted-foreground">
            {mode === 'pomodoro'
              ? `${pomodoro.workMinutes}m work · ${pomodoro.shortBreakMinutes}m break · ${pomodoro.longBreakMinutes}m long break`
              : mode === 'countdown'
                ? `A single ${countdownMinutes}-minute block. Finishing the full time counts as a completed session.`
                : 'Open-ended. Time is saved only when you stop.'}
          </p>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title="Session"
              description="Pick what this focus time is for"
              icon={<TimerIcon className="size-4" />}
            />
            <CardBody className="flex flex-col gap-3">
              <Field label="Working on" htmlFor="focus-task">
                <OptionSelect
                  id="focus-task"
                  value={taskId}
                  placeholder="No specific task"
                  onChange={setTaskId}
                  options={openTasks.map((t) => ({ value: t.id, label: t.title }))}
                />
              </Field>
              {mode === 'countdown' ? (
                <Field label="Length (minutes)">
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
              <Toggle
                checked={sound}
                onChange={setSound}
                label="Chime on interval end"
                description="A short synthesised tone when a work or break period completes."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Today's sessions"
              description={`${todaySessions.length} session(s) · ${formatDuration(todayMinutes)}`}
            />
            {todaySessions.length === 0 ? (
              <CardBody>
                <p className="text-sm text-muted-foreground">
                  No sessions yet today. Even one 25-minute block moves the focus score.
                </p>
              </CardBody>
            ) : (
              <div className="divide-y divide-border">
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
                        {session.taskId ? (taskById.get(session.taskId)?.title ?? 'Deleted task') : 'General focus'}
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

    </>
  )
}
