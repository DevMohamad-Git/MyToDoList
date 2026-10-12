import { useCallback, useEffect, useState } from 'react'
import {
  Award,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Coffee,
  Database,
  Download,
  FolderOpen,
  HardDrive,
  History,
  Hourglass,
  Languages,
  Laptop,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Moon,
  Palette,
  Paperclip,
  RotateCcw,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Sun,
  Timer,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Field,
  Input,
  JalaliTimePicker,
  PageHeader,
  SegmentedControl,
  Select,
  Slider,
  StatTile,
  Toggle,
  toast,
} from '@/components/ui'
import {
  ACCENT_COLORS,
  DEFAULT_SCORING_WEIGHTS,
} from '@/config/constants'
import { LANGUAGES, t, useI18n, useT, type TranslationKey } from '@/i18n'
import { estimateStorage, SCHEMA_VERSION } from '@/database/db'
import {
  exportFilename,
  exportWorkspace,
  importBundle,
  parseAndValidate,
  serializeBundle,
  type ExportOptions,
} from '@/services/importExport'
import {
  diagnoseWorkspace,
  optimizeAndVacuumWorkspace,
  createLocalSnapshot,
  getLatestSnapshot,
  restoreFromSnapshot,
  type DatabaseDiagnostics,
  type LocalSnapshotMeta,
} from '@/services/dbMaintenance'
import { activityRepo } from '@/storage/activityRepo'
import { downloadBlob, fsCapabilities, linkFolder, pickTextFile } from '@/storage/fileSystem'
import { workspaceRepo, type DeepPartial } from '@/storage/workspaceRepo'
import { achievementRepo } from '@/storage/reviewRepo'
import { useAppearance } from '@/stores/appearance'
import { useWorkspace, useWorkspaceStore } from '@/stores/workspace'
import type { WeekDay, WorkspaceSettings } from '@/types'
import { formatBytes } from '@/utils/date'

/**
 * Settings: workspace identity, planning and scoring configuration, appearance,
 * database health & vacuum, performance & retention policy, and data lifecycle.
 */
export function SettingsPage() {
  const t = useT()
  const language = useI18n((s) => s.language)
  const setLanguage = useI18n((s) => s.setLanguage)
  const workspace = useWorkspace()
  const updateActive = useWorkspaceStore((s) => s.updateActive)
  const updateSettings = useWorkspaceStore((s) => s.updateSettings)
  const refresh = useWorkspaceStore((s) => s.refresh)

  const [name, setName] = useState(workspace.name)
  const [description, setDescription] = useState(workspace.description)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(workspace.name)
    setDescription(workspace.description)
  }, [workspace.id, workspace.name, workspace.description])

  const appearance = useAppearance()
  const [exportOptions, setExportOptions] = useState<Required<ExportOptions>>({
    includeAttachments: false,
    includeActivity: true,
  })
  const [clearOpen, setClearOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [resetAchievementsOpen, setResetAchievementsOpen] = useState(false)
  const [resetSettingsOpen, setResetSettingsOpen] = useState(false)
  const [restoreSnapshotOpen, setRestoreSnapshotOpen] = useState(false)
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const [lastExportName, setLastExportName] = useState<string | null>(null)

  // Database health, vacuum & maintenance state
  const [diagnostics, setDiagnostics] = useState<DatabaseDiagnostics | null>(null)
  const [diagLoading, setDiagLoading] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [snapshotMeta, setSnapshotMeta] = useState<LocalSnapshotMeta | null>(null)
  const [activityRetentionDays, setActivityRetentionDays] = useState<number>(30)
  const [autoArchiveCompleted, setAutoArchiveCompleted] = useState<boolean>(true)
  const [pruningLogs, setPruningLogs] = useState(false)

  const runDiagnostics = useCallback(async () => {
    setDiagLoading(true)
    try {
      const diag = await diagnoseWorkspace(workspace.id)
      setDiagnostics(diag)
    } catch {
      // Ignore
    } finally {
      setDiagLoading(false)
    }
  }, [workspace.id])

  useEffect(() => {
    void estimateStorage().then(setStorage)
    void runDiagnostics()
    void getLatestSnapshot(workspace.id).then(setSnapshotMeta)
  }, [workspace.id, lastExportName, runDiagnostics])

  const capabilities = fsCapabilities()

  async function saveIdentity() {
    if (!name.trim()) {
      toast.error(t('toastWsNeedsName'))
      return
    }
    await updateActive({ name: name.trim(), description })
    toast.success(t('toastWsUpdated'))
  }

  async function patchSettings(patch: DeepPartial<WorkspaceSettings>, message?: string) {
    await updateSettings(patch)
    if (message) toast.success(message)
  }

  async function handleOptimize() {
    setOptimizing(true)
    try {
      const res = await optimizeAndVacuumWorkspace(workspace.id, {
        purgeOrphanBlobs: true,
        fixDanglingReferences: true,
        resyncDurations: true,
        pruneActivityDays: activityRetentionDays > 0 ? activityRetentionDays : null,
        archiveCompletedDays: autoArchiveCompleted ? 30 : null,
      })
      await runDiagnostics()
      void estimateStorage().then(setStorage)
      await refresh()
      toast.success(
        t('setOptimizationSuccess', {
          bytes: formatBytes(res.freedBytes),
          blobs: res.removedOrphanBlobs,
          durations: res.resyncedDurations,
        }),
      )
    } catch (error) {
      toast.error((error as Error).message || 'Optimization failed')
    } finally {
      setOptimizing(false)
    }
  }

  async function handleCreateSnapshot() {
    setBusy(true)
    try {
      const meta = await createLocalSnapshot(workspace.id)
      setSnapshotMeta(meta)
      toast.success(t('setSnapshotSaved', { size: formatBytes(meta.sizeBytes) }))
    } catch (error) {
      toast.error((error as Error).message || 'Snapshot failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleRestoreSnapshot() {
    setBusy(true)
    try {
      const ok = await restoreFromSnapshot(workspace.id)
      if (ok) {
        await refresh()
        await runDiagnostics()
        void estimateStorage().then(setStorage)
        setRestoreSnapshotOpen(false)
        toast.success(t('setSnapshotRestored'))
      } else {
        toast.error('Could not restore snapshot')
      }
    } catch (error) {
      toast.error((error as Error).message || 'Restore failed')
    } finally {
      setBusy(false)
    }
  }

  async function handlePruneLogs() {
    setPruningLogs(true)
    try {
      const days = activityRetentionDays > 0 ? activityRetentionDays : 30
      const count = await activityRepo.pruneOlderThan(workspace.id, days)
      await runDiagnostics()
      toast.success(t('setPrunedLogsToast', { count }))
    } catch (error) {
      toast.error((error as Error).message || 'Prune failed')
    } finally {
      setPruningLogs(false)
    }
  }

  async function doExport() {
    setBusy(true)
    try {
      const bundle = await exportWorkspace(workspace.id, exportOptions)
      const filename = exportFilename(workspace.name)
      downloadBlob(new Blob([serializeBundle(bundle)], { type: 'application/json' }), filename)
      setLastExportName(filename)
      toast.success(t('toastExported', { name: filename }))
    } catch (error) {
      toast.error((error as Error).message || t('toastExportFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function doImport() {
    setBusy(true)
    try {
      const file = await pickTextFile()
      if (!file) return
      const text = await file.text()
      const result = parseAndValidate(text)
      if (!result.valid || !result.bundle) {
        toast.error(t('toastInvalidFile', { msg: result.issues[0]?.message ?? 'unknown problem' }))
        return
      }
      const imported = await importBundle(result.bundle, 'new_workspace')
      await refresh()
      await runDiagnostics()
      toast.success(
        t('toastImported', {
          name: imported.workspaceName,
          tasks: imported.counts.tasks ?? 0,
          projects: imported.counts.projects ?? 0,
        }),
      )
    } catch (error) {
      toast.error((error as Error).message || t('toastImportFailed'))
    } finally {
      setBusy(false)
    }
  }

  const breakdownTotal = diagnostics
    ? (diagnostics.breakdown.tasksCount +
        diagnostics.breakdown.projectsCount +
        diagnostics.breakdown.attachmentsCount +
        diagnostics.breakdown.timeEntriesCount +
        diagnostics.breakdown.habitsCount +
        diagnostics.breakdown.activityLogsCount) || 1
    : 1

  const tasksPct = diagnostics
    ? Math.max(
        2,
        Math.round(
          ((diagnostics.breakdown.tasksCount + diagnostics.breakdown.projectsCount) / breakdownTotal) * 100,
        ),
      )
    : 25
  const filesPct = diagnostics
    ? Math.max(2, Math.round((diagnostics.breakdown.attachmentsCount / breakdownTotal) * 100))
    : 25
  const timePct = diagnostics
    ? Math.max(
        2,
        Math.round(
          ((diagnostics.breakdown.timeEntriesCount + diagnostics.breakdown.habitsCount) / breakdownTotal) * 100,
        ),
      )
    : 25
  const actPct = diagnostics
    ? Math.max(2, Math.round((diagnostics.breakdown.activityLogsCount / breakdownTotal) * 100))
    : 25

  const totalAnomalies = diagnostics
    ? diagnostics.anomalies.orphanedBlobsCount +
      diagnostics.anomalies.brokenAttachmentsCount +
      diagnostics.anomalies.danglingParentTasksCount +
      diagnostics.anomalies.brokenDependenciesCount +
      diagnostics.anomalies.desyncedDurationsCount +
      diagnostics.anomalies.orphanedHabitEntriesCount +
      diagnostics.anomalies.orphanedTimeEntriesCount
    : 0

  return (
    <>
      <PageHeader title={t('setTitle')} description={t('setDesc')} />

      <div className="flex flex-col gap-4">
        {/* ------------------------------------------------------- identity -- */}
        <Card>
          <CardHeader
            title={t('setWorkspace')}
            description={t('setIdentityDesc')}
            icon={<SettingsIcon className="size-4" />}
          />
          <CardBody className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('setName')} required htmlFor="ws-name">
                <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label={t('setDescription')} htmlFor="ws-desc">
                <Input
                  id="ws-desc"
                  value={description}
                  placeholder={t('setOptional')}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
            </div>
            <div>
              <Button variant="primary" size="sm" onClick={() => void saveIdentity()}>
                <Save className="size-3.5" />
                {t('setSaveWorkspace')}
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* -------------------------------------------------------- planning -- */}
        <Card>
          <CardHeader
            title={t('setPlanning')}
            description={t('setPlanningDesc')}
            icon={<Timer className="size-4" />}
          />
          <CardBody className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t('setWorkStarts')}>
                <JalaliTimePicker
                  className="w-full"
                  value={minutesToTime(workspace.settings.planning.workingHours.start)}
                  onChange={(v) =>
                    void patchSettings({
                      planning: { workingHours: { start: timeToMinutes(v) } },
                    })
                  }
                />
              </Field>
              <Field label={t('setWorkEnds')}>
                <JalaliTimePicker
                  className="w-full"
                  value={minutesToTime(workspace.settings.planning.workingHours.end)}
                  onChange={(v) =>
                    void patchSettings({
                      planning: { workingHours: { end: timeToMinutes(v) } },
                    })
                  }
                />
              </Field>
              <Field label={t('setWeekStartsOn')}>
                <Select
                  value={String(workspace.settings.planning.weekStartsOn)}
                  onChange={(e) =>
                    void patchSettings({
                      planning: { weekStartsOn: Number(e.target.value) as WeekDay },
                    })
                  }
                >
                  <option value="0">{t('setSunday')}</option>
                  <option value="1">{t('setMonday')}</option>
                  <option value="6">{t('setSaturday')}</option>
                </Select>
              </Field>
              <Field label={t('setWorkdays')}>
                <WorkdayPicker
                  days={workspace.settings.planning.workingHours.days}
                  onChange={(days) => void patchSettings({ planning: { workingHours: { days } } })}
                  weekStartsOn={workspace.settings.planning.weekStartsOn}
                  language={language}
                />
              </Field>
            </div>
            {workspace.settings.planning.workingHours.start >= workspace.settings.planning.workingHours.end && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
                <span>⚠️</span>
                <span>{t('setWorkingHoursInvalid')}</span>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <Slider
                label={t('setDailyCapacity')}
                suffix={t('unitMinutes')}
                min={60}
                max={720}
                step={30}
                value={workspace.settings.planning.dailyCapacityMinutes}
                onChange={(v) => void patchSettings({ planning: { dailyCapacityMinutes: v } })}
              />
              <Slider
                label={t('setDailyFocusTarget')}
                suffix={t('unitMinutes')}
                min={0}
                max={480}
                step={15}
                value={workspace.settings.planning.dailyFocusTarget}
                onChange={(v) => void patchSettings({ planning: { dailyFocusTarget: v } })}
              />
              <Slider
                label={t('setDefaultDuration')}
                suffix={t('unitMinutes')}
                min={5}
                max={240}
                step={5}
                value={workspace.settings.planning.defaultTaskDuration}
                onChange={(v) => void patchSettings({ planning: { defaultTaskDuration: v } })}
              />
            </div>
          </CardBody>
        </Card>

        {/* --------------------------------------------------------- scoring -- */}
        <Card>
          <CardHeader
            title={t('setDailyScore')}
            description={t('setScoreDesc')}
            icon={<Award className="size-4 text-accent" />}
            actions={
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void patchSettings(
                    { scoring: { weights: { ...DEFAULT_SCORING_WEIGHTS } } },
                    t('toastWsUpdated'),
                  )
                }
              >
                <RotateCcw className="size-3.5" />
                {t('setResetWeights')}
              </Button>
            }
          />
          <CardBody className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span>
                {t('setScoreTotal', {
                  total: Object.values(workspace.settings.scoring.weights).reduce((a, b) => a + b, 0),
                })}
              </span>
              <span className="font-semibold text-foreground tabular-nums">
                {Object.values(workspace.settings.scoring.weights).reduce((a, b) => a + b, 0)}%
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ['taskCompletion', 'compTaskCompletion'],
                  ['priorityCompletion', 'compPriorityCompletion'],
                  ['deadlineDiscipline', 'compDeadlineDiscipline'],
                  ['timeEfficiency', 'compTimeEfficiency'],
                  ['focusTime', 'compFocusTime'],
                  ['consistency', 'compConsistency'],
                ] as const
              ).map(([key, labelKey]) => (
                <Slider
                  key={key}
                  label={t(labelKey)}
                  suffix="%"
                  min={0}
                  max={100}
                  value={workspace.settings.scoring.weights[key]}
                  onChange={(v) =>
                    void patchSettings({
                      scoring: {
                        weights: {
                          ...workspace.settings.scoring.weights,
                          [key]: v,
                        },
                      },
                    })
                  }
                />
              ))}
            </div>
          </CardBody>
        </Card>

        {/* -------------------------------------------------------- pomodoro -- */}
        <Card>
          <CardHeader
            title={t('setFocusTimer')}
            description={t('setFocusTimerDesc')}
            icon={<Hourglass className="size-4 text-accent" />}
          />
          <CardBody className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Slider
                label={t('setWork')}
                suffix={t('unitMinutes')}
                min={5}
                max={90}
                step={5}
                value={workspace.settings.pomodoro.workMinutes}
                onChange={(v) => void patchSettings({ pomodoro: { workMinutes: v } })}
              />
              <Slider
                label={t('setShortBreak')}
                suffix={t('unitMinutes')}
                min={1}
                max={30}
                value={workspace.settings.pomodoro.shortBreakMinutes}
                onChange={(v) => void patchSettings({ pomodoro: { shortBreakMinutes: v } })}
              />
              <Slider
                label={t('setLongBreak')}
                suffix={t('unitMinutes')}
                min={5}
                max={60}
                step={5}
                value={workspace.settings.pomodoro.longBreakMinutes}
                onChange={(v) => void patchSettings({ pomodoro: { longBreakMinutes: v } })}
              />
              <Slider
                label={t('setCycles')}
                min={2}
                max={8}
                value={workspace.settings.pomodoro.cyclesBeforeLongBreak}
                onChange={(v) => void patchSettings({ pomodoro: { cyclesBeforeLongBreak: v } })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border/70 bg-card p-3.5 shadow-2xs">
                <Toggle
                  checked={workspace.settings.pomodoro.autoStartBreaks}
                  onChange={(v) => void patchSettings({ pomodoro: { autoStartBreaks: v } })}
                  label={t('setAutoBreaks')}
                  icon={<Coffee className="size-4 text-accent" />}
                />
              </div>
              <div className="rounded-lg border border-border/70 bg-card p-3.5 shadow-2xs">
                <Toggle
                  checked={workspace.settings.pomodoro.autoStartNextWork}
                  onChange={(v) => void patchSettings({ pomodoro: { autoStartNextWork: v } })}
                  label={t('setAutoNext')}
                  icon={<Zap className="size-4 text-accent" />}
                />
              </div>
              <div className="rounded-lg border border-border/70 bg-card p-3.5 shadow-2xs">
                <Toggle
                  checked={workspace.settings.pomodoro.soundEnabled}
                  onChange={(v) => void patchSettings({ pomodoro: { soundEnabled: v } })}
                  label={t('setChime')}
                  icon={<Bell className="size-4 text-accent" />}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        {/* ------------------------------------------------------ appearance & perf -- */}
        <Card>
          <CardHeader
            title={t('setAppearance')}
            description={t('setAppearanceDesc')}
            icon={<Palette className="size-4" />}
          />
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('setTheme')}</p>
                <SegmentedControl
                  value={appearance.theme}
                  size="md"
                  options={[
                    {
                      value: 'system',
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <Laptop className="size-3.5" />
                          {t('setSystem')}
                        </span>
                      ),
                    },
                    {
                      value: 'light',
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <Sun className="size-3.5" />
                          {t('setLight')}
                        </span>
                      ),
                    },
                    {
                      value: 'dark',
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <Moon className="size-3.5" />
                          {t('setDark')}
                        </span>
                      ),
                    },
                  ]}
                  onChange={appearance.setTheme}
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('setDensity')}</p>
                <SegmentedControl
                  value={appearance.density}
                  size="md"
                  options={[
                    {
                      value: 'compact',
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <Minimize2 className="size-3.5" />
                          {t('setCompact')}
                        </span>
                      ),
                    },
                    {
                      value: 'comfortable',
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <LayoutGrid className="size-3.5" />
                          {t('setComfortable')}
                        </span>
                      ),
                    },
                    {
                      value: 'spacious',
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <Maximize2 className="size-3.5" />
                          {t('setSpacious')}
                        </span>
                      ),
                    },
                  ]}
                  onChange={appearance.setDensity}
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('setAccent')}</p>
                <div className="flex gap-1.5">
                  {ACCENT_COLORS.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      title={a.label}
                      aria-label={`Accent ${a.label}`}
                      aria-pressed={appearance.accent === a.key}
                      onClick={() => appearance.setAccent(a.key)}
                      className="flex size-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: `hsl(${a.hue})`,
                        borderColor:
                          appearance.accent === a.key ? 'var(--color-foreground)' : 'transparent',
                      }}
                    >
                      {appearance.accent === a.key ? <Check className="size-3.5 text-white stroke-[2.5]" /> : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Performance and Motion Options */}
            <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-border/40">
              <div className="rounded-lg border border-border/70 bg-card p-3.5 shadow-2xs">
                <Toggle
                  checked={appearance.reducedMotion}
                  onChange={appearance.setReducedMotion}
                  label={t('setReducedMotion')}
                  description={t('setReducedMotionDesc')}
                  icon={<Zap className="size-4 text-accent" />}
                />
              </div>
              <div className="rounded-lg border border-border/70 bg-card p-3.5 shadow-2xs">
                <Toggle
                  checked={appearance.highPerformance}
                  onChange={appearance.setHighPerformance}
                  label={t('setHighPerfMode')}
                  description={t('setHighPerfModeDesc')}
                  icon={<ShieldCheck className="size-4 text-accent" />}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        {/* -------------------------------------------------------- language -- */}
        <Card>
          <CardHeader
            title={t('setLanguage')}
            description={t('setLanguageDesc')}
            icon={<Languages className="size-4" />}
          />
          <CardBody>
            <SegmentedControl
              value={language}
              size="md"
              options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
              onChange={setLanguage}
            />
          </CardBody>
        </Card>

        {/* ------------------------------ database health & optimization -- */}
        <Card className="border-accent/30 shadow-xs">
          <CardHeader
            title={t('setDbHealth')}
            description={t('setDbHealthDesc')}
            icon={<Sparkles className="size-4 text-accent" />}
            actions={
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={diagLoading}
                  onClick={() => void runDiagnostics()}
                >
                  <RotateCcw className={`size-3.5 ${diagLoading ? 'animate-spin' : ''}`} />
                  {t('setScanDb')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={optimizing}
                  onClick={() => void handleOptimize()}
                >
                  <Sparkles className="size-3.5" />
                  {optimizing ? t('setOptimizing') : t('setOptimizeDb')}
                </Button>
              </div>
            }
          />
          <CardBody className="flex flex-col gap-4">
            {/* Health Score Overview */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="flex items-center gap-3.5">
                <div
                  className={`flex size-13 shrink-0 items-center justify-center rounded-2xl font-bold text-lg tabular-nums border ${
                    diagnostics && diagnostics.healthScore >= 90
                      ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-500'
                      : diagnostics && diagnostics.healthScore >= 75
                        ? 'border-amber-500/30 bg-amber-500/15 text-amber-500'
                        : 'border-rose-500/30 bg-rose-500/15 text-rose-500'
                  }`}
                >
                  {diagnostics ? `${diagnostics.healthScore}%` : '—'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-foreground text-sm">{t('setHealthScore')}</h4>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        diagnostics && diagnostics.healthScore >= 90
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                          : diagnostics && diagnostics.healthScore >= 75
                            ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                      }`}
                    >
                      {diagnostics && diagnostics.healthScore >= 90
                        ? t('setHealthOptimal')
                        : diagnostics && diagnostics.healthScore >= 75
                          ? t('setHealthGood')
                          : t('setHealthNeedsAttention')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {totalAnomalies === 0
                      ? t('setNoAnomalies')
                      : t('setAnomaliesDetected', { count: totalAnomalies })}
                  </p>
                </div>
              </div>

              {/* Quick Anomaly Badges */}
              <div className="flex flex-wrap gap-1.5 sm:justify-end">
                {diagnostics && diagnostics.anomalies.orphanedBlobsCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-2xs font-medium text-amber-500 border border-amber-500/20">
                    <span>{diagnostics.anomalies.orphanedBlobsCount}</span>
                    <span>{t('setOrphanBlobs')}</span>
                  </span>
                ) : null}
                {diagnostics &&
                diagnostics.anomalies.danglingParentTasksCount + diagnostics.anomalies.brokenDependenciesCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-1 text-2xs font-medium text-rose-500 border border-rose-500/20">
                    <span>
                      {diagnostics.anomalies.danglingParentTasksCount + diagnostics.anomalies.brokenDependenciesCount}
                    </span>
                    <span>{t('setBrokenRefs')}</span>
                  </span>
                ) : null}
                {diagnostics && diagnostics.anomalies.desyncedDurationsCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-2xs font-medium text-amber-500 border border-amber-500/20">
                    <span>{diagnostics.anomalies.desyncedDurationsCount}</span>
                    <span>{t('setDesyncedDurations')}</span>
                  </span>
                ) : null}
                {totalAnomalies === 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500 border border-emerald-500/20">
                    <CheckCircle2 className="size-3.5" />
                    <span>100% OK</span>
                  </span>
                )}
              </div>
            </div>

            {/* Storage Breakdown Multi-segment bar */}
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span className="font-medium text-foreground">{t('setStorageBreakdown')}</span>
                <span>{storage ? formatBytes(storage.usage) : '—'}</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/60 flex gap-0.5">
                <div
                  style={{ width: `${tasksPct}%` }}
                  className="bg-indigo-500 h-full transition-all rounded-s-full"
                  title={`${t('setTasksAndProjects')}: ${diagnostics?.breakdown.tasksCount ?? 0}`}
                />
                <div
                  style={{ width: `${filesPct}%` }}
                  className="bg-emerald-500 h-full transition-all"
                  title={`${t('setFilesAndBlobs')}: ${diagnostics?.breakdown.attachmentsCount ?? 0}`}
                />
                <div
                  style={{ width: `${timePct}%` }}
                  className="bg-amber-500 h-full transition-all"
                  title={`${t('setTimeAndHabits')}: ${diagnostics?.breakdown.timeEntriesCount ?? 0}`}
                />
                <div
                  style={{ width: `${actPct}%` }}
                  className="bg-sky-500 h-full transition-all rounded-e-full"
                  title={`${t('setActivityLogs')}: ${diagnostics?.breakdown.activityLogsCount ?? 0}`}
                />
              </div>

              {/* Legend Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3 text-xs">
                <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5">
                  <span className="size-2 rounded-full bg-indigo-500 shrink-0" />
                  <div className="truncate">
                    <p className="text-2xs text-muted-foreground truncate">{t('setTasksAndProjects')}</p>
                    <p className="font-semibold text-foreground tabular-nums">
                      {(diagnostics?.breakdown.tasksCount ?? 0) + (diagnostics?.breakdown.projectsCount ?? 0)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5">
                  <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
                  <div className="truncate">
                    <p className="text-2xs text-muted-foreground truncate">{t('setFilesAndBlobs')}</p>
                    <p className="font-semibold text-foreground tabular-nums">
                      {diagnostics?.breakdown.attachmentsCount ?? 0} (
                      {diagnostics ? formatBytes(diagnostics.breakdown.blobsTotalBytes) : '0'})
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5">
                  <span className="size-2 rounded-full bg-amber-500 shrink-0" />
                  <div className="truncate">
                    <p className="text-2xs text-muted-foreground truncate">{t('setTimeAndHabits')}</p>
                    <p className="font-semibold text-foreground tabular-nums">
                      {(diagnostics?.breakdown.timeEntriesCount ?? 0) + (diagnostics?.breakdown.habitsCount ?? 0)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5">
                  <span className="size-2 rounded-full bg-sky-500 shrink-0" />
                  <div className="truncate">
                    <p className="text-2xs text-muted-foreground truncate">{t('setActivityLogs')}</p>
                    <p className="font-semibold text-foreground tabular-nums">
                      {diagnostics?.breakdown.activityLogsCount ?? 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* ------------------------- performance & retention policy -- */}
        <Card>
          <CardHeader
            title={t('setRetentionAndPerformance')}
            description={t('setRetentionDesc')}
            icon={<Clock className="size-4" />}
          />
          <CardBody className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card p-3.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">{t('setActivityRetention')}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pruningLogs}
                    onClick={() => void handlePruneLogs()}
                  >
                    <Trash2 className="size-3" />
                    {t('setPruneActivityNow')}
                  </Button>
                </div>
                <p className="text-2xs text-muted-foreground">{t('setActivityRetentionDesc')}</p>
                <SegmentedControl
                  value={String(activityRetentionDays)}
                  size="sm"
                  options={[
                    { value: '30', label: t('setKeep30Days') },
                    { value: '90', label: t('setKeep90Days') },
                    { value: '0', label: t('setKeepAll') },
                  ]}
                  onChange={(v) => setActivityRetentionDays(Number(v))}
                />
              </div>

              <div className="rounded-lg border border-border/70 bg-card p-3.5 shadow-2xs flex flex-col justify-center">
                <Toggle
                  checked={autoArchiveCompleted}
                  onChange={setAutoArchiveCompleted}
                  label={t('setAutoArchiveCompleted')}
                  description={t('setAutoArchiveDesc')}
                  icon={<History className="size-4 text-accent" />}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        {/* ------------------------------------------------------------ data -- */}
        <Card>
          <CardHeader
            title={t('setData')}
            description={t('setDataDesc')}
            icon={<Database className="size-4" />}
          />
          <CardBody className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile
                label={t('setStorageUsed')}
                value={storage ? formatBytes(storage.usage) : '—'}
                hint={
                  storage
                    ? t('setOfQuota', { q: formatBytes(storage.quota) })
                    : t('setEstUnavailable')
                }
                icon={<HardDrive className="size-4" />}
              />
              <StatTile
                label={t('setSchemaVersion')}
                value={`v${SCHEMA_VERSION}`}
                hint={t('setLocalDb')}
                icon={<Database className="size-4" />}
              />
              <StatTile
                label={t('setLastExport')}
                value={lastExportName ? t('setDone') : '—'}
                hint={lastExportName ?? t('setNoExportYet')}
                icon={<Download className="size-4" />}
              />
            </div>

            {/* Local Snapshot / Restore Point */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-border/70 bg-card p-3.5 shadow-2xs">
              <div className="flex items-center gap-3">
                <Clock className="size-4 text-accent shrink-0" />
                <div>
                  <p className="text-xs font-medium text-foreground">{t('setLocalSnapshot')}</p>
                  <p className="text-2xs text-muted-foreground">
                    {snapshotMeta
                      ? t('setLastSnapshotTime', {
                          time: new Date(snapshotMeta.savedAt).toLocaleDateString() + ' ' + new Date(snapshotMeta.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        })
                      : t('setNoSnapshot')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => void handleCreateSnapshot()} disabled={busy}>
                  <Save className="size-3.5" />
                  {t('setCreateSnapshot')}
                </Button>
                {snapshotMeta && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setRestoreSnapshotOpen(true)}
                    disabled={busy}
                  >
                    <RotateCcw className="size-3.5" />
                    {t('setRestoreSnapshot')}
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <Button variant="primary" onClick={() => void doExport()} disabled={busy}>
                <Download className="size-4" />
                {t('setExportWs')}
              </Button>
              <Button variant="secondary" onClick={() => void doImport()} disabled={busy}>
                <Upload className="size-4" />
                {t('setImportFile')}
              </Button>
              {capabilities.directoryPicker ? (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const result = await linkFolder(workspace.id)
                    if (result.ok) toast.success(t('toastLinkedFolder', { name: result.value.name }))
                    else toast.error(result.error)
                  }}
                >
                  <FolderOpen className="size-4" />
                  {t('setLinkFolder')}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">{t('setNoFolderLink')}</p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border/70 bg-card p-3.5 shadow-2xs">
                <Toggle
                  checked={exportOptions.includeAttachments}
                  onChange={(v) => setExportOptions((o) => ({ ...o, includeAttachments: v }))}
                  label={t('setIncludeAttachments')}
                  description={t('setAttachDesc')}
                  icon={<Paperclip className="size-4 text-accent" />}
                />
              </div>
              <div className="rounded-lg border border-border/70 bg-card p-3.5 shadow-2xs">
                <Toggle
                  checked={exportOptions.includeActivity}
                  onChange={(v) => setExportOptions((o) => ({ ...o, includeActivity: v }))}
                  label={t('setIncludeActivity')}
                  icon={<History className="size-4 text-accent" />}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        {/* ------------------------------------------------------ danger zone -- */}
        <Card className="border-rose-500/30">
          <CardHeader
            title={t('setDangerZone')}
            description={t('setDangerDesc')}
            icon={<Trash2 className="size-4 text-rose-400" />}
          />
          <CardBody className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setResetSettingsOpen(true)}>
              <RotateCcw className="size-4" />
              {t('setResetSettings')}
            </Button>
            <Button variant="outline" onClick={() => setResetAchievementsOpen(true)}>
              <Award className="size-4 text-amber-500" />
              {t('setResetAchievements')}
            </Button>
            <Button variant="outline" onClick={() => setClearOpen(true)}>
              <Trash2 className="size-4" />
              {t('setClearContent')}
            </Button>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
              {t('setDeleteWorkspace')}
            </Button>
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={restoreSnapshotOpen}
        onClose={() => setRestoreSnapshotOpen(false)}
        destructive={true}
        confirmLabel={t('setRestoreSnapshot')}
        cancelLabel={t('cCancel')}
        onConfirm={() => void handleRestoreSnapshot()}
        title={t('setSnapshotConfirmTitle')}
        message={t('setSnapshotConfirmMsg', {
          time: snapshotMeta ? new Date(snapshotMeta.savedAt).toLocaleString() : '',
        })}
      />

      <ConfirmDialog
        open={resetSettingsOpen}
        onClose={() => setResetSettingsOpen(false)}
        destructive={false}
        confirmLabel={t('setResetSettings')}
        cancelLabel={t('cCancel')}
        onConfirm={async () => {
          await workspaceRepo.resetSettings(workspace.id)
          await refresh()
          toast.success(t('toastSettingsReset'))
          setResetSettingsOpen(false)
        }}
        title={t('setResetSettingsTitle')}
        message={t('setResetSettingsMsg')}
      />

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={async () => {
          await workspaceRepo.clearContent(workspace.id)
          await refresh()
          await runDiagnostics()
          toast.success(t('toastContentCleared'))
          setClearOpen(false)
        }}
        title={t('setClearConfirmTitle')}
        message={t('setClearConfirmMsg', { name: workspace.name })}
        confirmLabel={t('setClearConfirmBtn')}
        cancelLabel={t('cCancel')}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          await useWorkspaceStore.getState().removeWorkspace(workspace.id)
          toast.success(t('toastWsDeleted'))
          setDeleteOpen(false)
        }}
        title={t('setDeleteConfirmTitle')}
        message={t('setDeleteConfirmMsg', { name: workspace.name })}
        confirmLabel={t('setDeleteWorkspace')}
        cancelLabel={t('cCancel')}
      />

      <ConfirmDialog
        open={resetAchievementsOpen}
        onClose={() => setResetAchievementsOpen(false)}
        destructive={false}
        confirmLabel={t('setResetAchievements')}
        cancelLabel={t('cCancel')}
        onConfirm={async () => {
          await achievementRepo.reset(workspace.id)
          await refresh()
          toast.success(t('toastAchReset'))
          setResetAchievementsOpen(false)
        }}
        title={t('setResetAchTitle')}
        message={t('setResetAchMsg')}
      />
    </>
  )
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return 540
  return h * 60 + m
}

function WorkdayPicker({
  days,
  onChange,
  weekStartsOn = 1,
  language = 'en',
}: {
  days: WeekDay[]
  onChange: (days: WeekDay[]) => void
  weekStartsOn?: WeekDay
  language?: string
}) {
  const isPersian = language === 'fa'
  const order: WeekDay[] =
    isPersian || weekStartsOn === 6
      ? [6, 0, 1, 2, 3, 4, 5]
      : weekStartsOn === 0
        ? [0, 1, 2, 3, 4, 5, 6]
        : [1, 2, 3, 4, 5, 6, 0]

  const dayConfig: Record<WeekDay, { en: string; fa: string; key: TranslationKey }> = {
    0: { en: 'S', fa: 'ی', key: 'wdSun' },
    1: { en: 'M', fa: 'د', key: 'wdMon' },
    2: { en: 'T', fa: 'س', key: 'wdTue' },
    3: { en: 'W', fa: 'چ', key: 'wdWed' },
    4: { en: 'T', fa: 'پ', key: 'wdThu' },
    5: { en: 'F', fa: 'ج', key: 'wdFri' },
    6: { en: 'S', fa: 'ش', key: 'wdSat' },
  }

  return (
    <div className="flex flex-wrap gap-1">
      {order.map((day) => {
        const selected = days.includes(day)
        const label = isPersian ? dayConfig[day].fa : dayConfig[day].en
        const fullTitle = t(dayConfig[day].key)
        return (
          <button
            key={day}
            type="button"
            title={fullTitle}
            aria-pressed={selected}
            aria-label={fullTitle}
            onClick={() =>
              onChange(selected ? days.filter((x) => x !== day) : [...days, day].sort())
            }
            className={`size-7 rounded-md border text-xs font-medium transition-colors ${
              selected
                ? 'border-accent bg-accent/15 text-accent font-semibold'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
