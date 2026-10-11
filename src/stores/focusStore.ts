import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { toast } from '@/components/ui'
import { t } from '@/i18n'
import { ambientAudio, type AmbientSoundType } from '@/services/ambientAudio'
import { pipTimer } from '@/services/pipTimer'
import { DEFAULT_POMODORO } from '@/config/constants'
import { focusRepo } from '@/storage/timeRepo'
import type { FocusMode, PomodoroSettings, WorkspaceSettings } from '@/types'
import { formatTimer } from '@/utils/date'

export interface FocusState {
  mode: FocusMode
  phase: 'work' | 'short_break' | 'long_break'
  cycle: number
  running: boolean
  elapsedSeconds: number
  interruptions: number
  taskId: string
  taskTitle: string
  countdownMinutes: number
  sound: boolean
  ambientType: AmbientSoundType
  ambientVolume: number
  ambientWhileRunningOnly: boolean
  pipActive: boolean
  zenMode: boolean
  startStamp: number | null // Epoch ms timestamp

  reflectionOpen: boolean
  reflectionSessionInfo: { duration: number; taskTitle: string } | null
  sessionCapturedIdeas: { id: string; title: string; time: string }[]

  currentWorkspaceId: string | null
  currentSettings: WorkspaceSettings | null

  // Actions
  setMode: (mode: FocusMode) => void
  setTaskId: (taskId: string, title?: string) => void
  setCountdownMinutes: (mins: number) => void
  setSound: (sound: boolean) => void
  setAmbientType: (type: AmbientSoundType) => void
  setAmbientVolume: (vol: number) => void
  setAmbientWhileRunningOnly: (val: boolean) => void
  setPipActive: (active: boolean) => void
  setZenMode: (zen: boolean) => void
  setReflectionOpen: (open: boolean) => void
  addCapturedIdea: (idea: { id: string; title: string; time: string }) => void
  syncContext: (workspaceId: string, settings: WorkspaceSettings) => void
  updateDisplay: () => void

  start: (workspaceId: string, settings: WorkspaceSettings) => void
  pause: () => void
  stop: (workspaceId?: string, settings?: WorkspaceSettings) => Promise<void>
  advancePomodoro: (workspaceId?: string, settings?: WorkspaceSettings) => Promise<void>
  reset: () => void
  tick: (workspaceId?: string, settings?: WorkspaceSettings) => void
}

let tickerInterval: number | null = null

function chime() {
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

function triggerNotification(title: string, body: string) {
  if (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    try {
      new Notification(title, { body, icon: '/favicon.ico' })
    } catch {
      // Ignore notification errors
    }
  }
}

export function getPhaseMinutes(
  mode: FocusMode,
  phase: 'work' | 'short_break' | 'long_break',
  countdownMinutes: number,
  pomodoro: PomodoroSettings,
): number {
  switch (phase) {
    case 'work':
      return mode === 'countdown' ? countdownMinutes : pomodoro.workMinutes
    case 'short_break':
      return pomodoro.shortBreakMinutes
    case 'long_break':
      return pomodoro.longBreakMinutes
  }
}

export const useFocusStore = create<FocusState>()(
  persist(
    (set, get) => ({
      mode: 'pomodoro',
      phase: 'work',
      cycle: 1,
      running: false,
      elapsedSeconds: 0,
      interruptions: 0,
      taskId: '',
      taskTitle: '',
      countdownMinutes: 50,
      sound: true,
      ambientType: 'none',
      ambientVolume: 0.35,
      ambientWhileRunningOnly: true,
      pipActive: false,
      zenMode: false,
      startStamp: null,

      reflectionOpen: false,
      reflectionSessionInfo: null,
      sessionCapturedIdeas: [],

      currentWorkspaceId: null,
      currentSettings: null,

      syncContext(workspaceId, settings) {
        set({ currentWorkspaceId: workspaceId, currentSettings: settings })
      },

      setMode(mode) {
        if (get().running) {
          toast.info(t('focusToastStopFirst'))
          return
        }
        set({ mode, phase: 'work', elapsedSeconds: 0, startStamp: null })
        get().updateDisplay()
      },

      setTaskId(taskId, title = '') {
        set({ taskId, taskTitle: title })
        get().updateDisplay()
      },

      setCountdownMinutes(countdownMinutes) {
        if (get().running || get().elapsedSeconds > 0) return
        set({ countdownMinutes: Math.max(5, countdownMinutes) })
        get().updateDisplay()
      },

      setSound(sound) {
        set({ sound })
      },

      setAmbientType(ambientType) {
        set({ ambientType })
        const { running, ambientWhileRunningOnly } = get()
        ambientAudio.setSound(ambientType, !ambientWhileRunningOnly || running)
      },

      setAmbientVolume(ambientVolume) {
        set({ ambientVolume })
        ambientAudio.setVolume(ambientVolume)
      },

      setAmbientWhileRunningOnly(ambientWhileRunningOnly) {
        set({ ambientWhileRunningOnly })
        const { ambientType, running } = get()
        if (ambientType !== 'none') {
          if (!ambientWhileRunningOnly || running) {
            void ambientAudio.play()
          } else {
            ambientAudio.stop()
          }
        }
      },

      setPipActive(pipActive) {
        set({ pipActive })
      },

      setZenMode(zenMode) {
        set({ zenMode })
      },

      setReflectionOpen(reflectionOpen) {
        set({ reflectionOpen })
      },

      addCapturedIdea(idea) {
        set((s) => ({ sessionCapturedIdeas: [idea, ...s.sessionCapturedIdeas] }))
      },

      updateDisplay() {
        const {
          mode,
          phase,
          cycle,
          countdownMinutes,
          elapsedSeconds,
          taskTitle,
          running,
          currentSettings,
        } = get()

        const pomodoro = currentSettings?.pomodoro ?? DEFAULT_POMODORO
        const totalSeconds = getPhaseMinutes(mode, phase, countdownMinutes, pomodoro) * 60
        const remaining = mode === 'stopwatch' ? elapsedSeconds : Math.max(0, totalSeconds - elapsedSeconds)
        const isBreak = phase !== 'work'

        const timerStr = formatTimer(remaining)
        const titleTask = taskTitle || t('focusTitle')
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

        if (pipTimer.isActive()) {
          pipTimer.render(timerStr, titleTask, phaseLabel, isBreak, running)
        }

        if (typeof document !== 'undefined') {
          if (running) {
            document.title = `(${timerStr}) ${isBreak ? '☕' : '⚡'} ${titleTask} | FlowOS`
          } else if (elapsedSeconds > 0) {
            document.title = `[⏸ ${timerStr}] ${titleTask} | FlowOS`
          } else {
            document.title = 'FlowOS'
          }
        }
      },

      start(workspaceId, settings) {
        const now = Date.now()
        const currentElapsed = get().elapsedSeconds
        set({
          running: true,
          startStamp: now - currentElapsed * 1000,
          currentWorkspaceId: workspaceId,
          currentSettings: settings,
        })

        const { ambientType, ambientWhileRunningOnly, ambientVolume } = get()
        if (ambientType !== 'none' && ambientWhileRunningOnly) {
          ambientAudio.setVolume(ambientVolume)
          void ambientAudio.play()
        }

        if (tickerInterval == null) {
          tickerInterval = window.setInterval(() => {
            get().tick()
          }, 1000)
        }

        get().updateDisplay()
      },

      pause() {
        const { running, elapsedSeconds, ambientType, ambientWhileRunningOnly } = get()
        if (running) {
          set((s) => ({
            running: false,
            interruptions: s.interruptions + 1,
          }))
          if (ambientType !== 'none' && ambientWhileRunningOnly) {
            ambientAudio.stop()
          }
        } else {
          const now = Date.now()
          set({
            running: true,
            startStamp: now - elapsedSeconds * 1000,
          })
          if (ambientType !== 'none' && ambientWhileRunningOnly) {
            void ambientAudio.play()
          }
          if (tickerInterval == null) {
            tickerInterval = window.setInterval(() => {
              get().tick()
            }, 1000)
          }
        }
        get().updateDisplay()
      },

      async stop(workspaceIdParam, settingsParam) {
        const {
          startStamp,
          elapsedSeconds,
          taskId,
          taskTitle,
          mode,
          phase,
          cycle,
          countdownMinutes,
          interruptions,
          ambientType,
          ambientWhileRunningOnly,
          currentWorkspaceId,
          currentSettings,
        } = get()

        const workspaceId = workspaceIdParam || currentWorkspaceId || ''
        const settings = settingsParam || currentSettings

        if (tickerInterval != null) {
          window.clearInterval(tickerInterval)
          tickerInterval = null
        }

        if (ambientType !== 'none' && ambientWhileRunningOnly) {
          ambientAudio.stop()
        }

        set({ running: false })

        if (startStamp && workspaceId) {
          const start = new Date(startStamp)
          const focusedMinutes = Math.round(elapsedSeconds / 60)
          if (focusedMinutes >= 1) {
            const plannedDuration = getPhaseMinutes(
              mode,
              'work',
              countdownMinutes,
              settings?.pomodoro ?? DEFAULT_POMODORO,
            )
            await focusRepo.save({
              workspaceId,
              taskId: taskId || null,
              start,
              end: new Date(),
              mode,
              plannedDuration,
              focusedMinutes,
              pomodoroCycle: mode === 'pomodoro' && phase === 'work' ? cycle : null,
              completed: false,
              interruptions,
            })
            const onTaskText = taskTitle ? t('focusToastOnTask', { title: taskTitle }) : ''
            toast.success(t('focusToastSaved', { min: focusedMinutes, task: onTaskText }))
            set({
              reflectionSessionInfo: {
                duration: focusedMinutes,
                taskTitle: taskTitle || t('focusGeneralSession'),
              },
              reflectionOpen: true,
            })
          }
        }

        set({
          elapsedSeconds: 0,
          startStamp: null,
          interruptions: 0,
        })
        get().updateDisplay()
      },

      async advancePomodoro(workspaceIdParam, settingsParam) {
        const {
          startStamp,
          elapsedSeconds,
          taskId,
          taskTitle,
          mode,
          phase,
          cycle,
          countdownMinutes,
          interruptions,
          sound,
          currentWorkspaceId,
          currentSettings,
        } = get()

        const workspaceId = workspaceIdParam || currentWorkspaceId || ''
        const settings = settingsParam || currentSettings
        const pomodoro = settings?.pomodoro ?? DEFAULT_POMODORO

        if (startStamp && phase === 'work' && workspaceId) {
          const start = new Date(startStamp)
          const focusedMinutes = Math.round(elapsedSeconds / 60)
          if (focusedMinutes >= 1) {
            const plannedDuration = getPhaseMinutes(mode, 'work', countdownMinutes, pomodoro)
            await focusRepo.save({
              workspaceId,
              taskId: taskId || null,
              start,
              end: new Date(),
              mode,
              plannedDuration,
              focusedMinutes,
              pomodoroCycle: cycle,
              completed: true,
              interruptions,
            })
            const onTaskText = taskTitle ? t('focusToastOnTask', { title: taskTitle }) : ''
            toast.success(t('focusToastSaved', { min: focusedMinutes, task: onTaskText }))
            set({
              reflectionSessionInfo: {
                duration: focusedMinutes,
                taskTitle: taskTitle || t('focusGeneralSession'),
              },
              reflectionOpen: true,
            })
          }
        }

        if (sound) chime()

        if (phase === 'work') {
          triggerNotification(t('focusNotifWorkDone'), t('focusNotifWorkDoneBody'))
          const isLong = cycle % Math.max(1, pomodoro.cyclesBeforeLongBreak) === 0
          const nextPhase = isLong ? 'long_break' : 'short_break'
          const shouldAutoRun = pomodoro.autoStartBreaks
          set({
            phase: nextPhase,
            elapsedSeconds: 0,
            startStamp: shouldAutoRun ? Date.now() : null,
            running: shouldAutoRun,
            interruptions: 0,
          })
        } else {
          triggerNotification(t('focusNotifBreakDone'), t('focusNotifBreakDoneBody'))
          const shouldAutoRun = pomodoro.autoStartNextWork
          set({
            phase: 'work',
            cycle: cycle + 1,
            elapsedSeconds: 0,
            startStamp: shouldAutoRun ? Date.now() : null,
            running: shouldAutoRun,
            interruptions: 0,
          })
        }
        get().updateDisplay()
      },

      reset() {
        if (tickerInterval != null) {
          window.clearInterval(tickerInterval)
          tickerInterval = null
        }
        const { ambientType, ambientWhileRunningOnly } = get()
        if (ambientType !== 'none' && ambientWhileRunningOnly) {
          ambientAudio.stop()
        }
        set({
          running: false,
          elapsedSeconds: 0,
          startStamp: null,
          interruptions: 0,
        })
        get().updateDisplay()
      },

      tick(workspaceIdParam, settingsParam) {
        const {
          running,
          startStamp,
          mode,
          phase,
          countdownMinutes,
          taskId,
          taskTitle,
          interruptions,
          sound,
          currentWorkspaceId,
          currentSettings,
        } = get()

        if (workspaceIdParam && workspaceIdParam !== currentWorkspaceId) {
          set({ currentWorkspaceId: workspaceIdParam })
        }
        if (settingsParam && settingsParam !== currentSettings) {
          set({ currentSettings: settingsParam })
        }

        if (!running || startStamp == null) return

        const workspaceId = workspaceIdParam || currentWorkspaceId || ''
        const settings = settingsParam || currentSettings
        const pomodoro = settings?.pomodoro ?? DEFAULT_POMODORO

        const now = Date.now()
        // Exact drift-free elapsed seconds calculation
        const exactElapsed = Math.max(0, Math.floor((now - startStamp) / 1000))
        set({ elapsedSeconds: exactElapsed })

        const totalSeconds = getPhaseMinutes(mode, phase, countdownMinutes, pomodoro) * 60

        // Update floating Picture-in-Picture window and document title
        get().updateDisplay()

        // Check interval completion
        if (mode !== 'stopwatch' && exactElapsed >= totalSeconds) {
          if (mode === 'countdown') {
            const start = new Date(startStamp)
            const focusedMinutes = Math.round(exactElapsed / 60)
            if (workspaceId) {
              void focusRepo.save({
                workspaceId,
                taskId: taskId || null,
                start,
                end: new Date(),
                mode,
                plannedDuration: countdownMinutes,
                focusedMinutes,
                pomodoroCycle: null,
                completed: true,
                interruptions,
              })
            }

            if (sound) chime()
            triggerNotification(t('focusNotifCountdownDone'), t('focusNotifCountdownDoneBody'))

            if (focusedMinutes >= 1) {
              const onTaskText = taskTitle ? t('focusToastOnTask', { title: taskTitle }) : ''
              toast.success(t('focusToastSaved', { min: focusedMinutes, task: onTaskText }))
              set({
                reflectionSessionInfo: {
                  duration: focusedMinutes,
                  taskTitle: taskTitle || t('focusGeneralSession'),
                },
                reflectionOpen: true,
              })
            }

            set({
              running: false,
              elapsedSeconds: 0,
              startStamp: null,
            })
            get().updateDisplay()
          } else {
            void get().advancePomodoro(workspaceId, settings ?? undefined)
          }
        }
      },
    }),
    {
      name: 'momentum.focus_session',
      partialize: (s) => ({
        mode: s.mode,
        phase: s.phase,
        cycle: s.cycle,
        running: s.running,
        elapsedSeconds: s.elapsedSeconds,
        startStamp: s.startStamp,
        interruptions: s.interruptions,
        taskId: s.taskId,
        taskTitle: s.taskTitle,
        countdownMinutes: s.countdownMinutes,
        sound: s.sound,
        ambientType: s.ambientType,
        ambientVolume: s.ambientVolume,
        ambientWhileRunningOnly: s.ambientWhileRunningOnly,
        currentWorkspaceId: s.currentWorkspaceId,
      }),
    },
  ),
)

// Global event bindings
if (typeof window !== 'undefined') {
  pipTimer.setOnStateChange((active) => {
    useFocusStore.setState({ pipActive: active })
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const s = useFocusStore.getState()
      if (s.running) {
        s.tick()
      }
    }
  })

  // Auto-resume timer if hydrated running session exists
  setTimeout(() => {
    const state = useFocusStore.getState()
    if (state.running && state.startStamp) {
      const exactElapsed = Math.max(0, Math.floor((Date.now() - state.startStamp) / 1000))
      useFocusStore.setState({ elapsedSeconds: exactElapsed })
      if (tickerInterval == null) {
        tickerInterval = window.setInterval(() => {
          useFocusStore.getState().tick()
        }, 1000)
      }
      state.updateDisplay()
    }
  }, 100)
}
