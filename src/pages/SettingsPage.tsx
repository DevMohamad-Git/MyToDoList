import { useEffect, useState } from 'react'
import {
  Database,
  Download,
  Languages,
  Palette,
  RotateCcw,
  Save,
  Settings as SettingsIcon,
  Timer,
  Trash2,
  Upload,
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
import { downloadBlob, fsCapabilities, linkFolder, pickTextFile } from '@/storage/fileSystem'
import { workspaceRepo, type DeepPartial } from '@/storage/workspaceRepo'
import { achievementRepo } from '@/storage/reviewRepo'
import { useAppearance } from '@/stores/appearance'
import { useWorkspace, useWorkspaceStore } from '@/stores/workspace'
import type { WeekDay, WorkspaceSettings } from '@/types'
import { formatBytes } from '@/utils/date'

/**
 * Settings: workspace identity, planning and scoring configuration, appearance,
 * and the local-data lifecycle (export, import, link a folder, wipe).
 *
 * Settings patches go through `updateSettings`, which deep-merges, so every
 * control here can write just the field it owns without clobbering siblings.
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

  const appearance = useAppearance()
  const [exportOptions, setExportOptions] = useState<Required<ExportOptions>>({
    includeAttachments: false,
    includeActivity: true,
  })
  const [clearOpen, setClearOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [resetAchievementsOpen, setResetAchievementsOpen] = useState(false)
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const [lastExportName, setLastExportName] = useState<string | null>(null)

  useEffect(() => {
    void estimateStorage().then(setStorage)
  }, [lastExportName])

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
                />
              </Field>
            </div>
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
          <CardHeader title={t('setDailyScore')} description={t('setScoreDesc')} />
          <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          </CardBody>
        </Card>

        {/* -------------------------------------------------------- pomodoro -- */}
        <Card>
          <CardHeader title={t('setFocusTimer')} description={t('setFocusTimerDesc')} />
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
            <div className="grid gap-2 sm:grid-cols-3">
              <Toggle
                checked={workspace.settings.pomodoro.autoStartBreaks}
                onChange={(v) => void patchSettings({ pomodoro: { autoStartBreaks: v } })}
                label={t('setAutoBreaks')}
              />
              <Toggle
                checked={workspace.settings.pomodoro.autoStartNextWork}
                onChange={(v) => void patchSettings({ pomodoro: { autoStartNextWork: v } })}
                label={t('setAutoNext')}
              />
              <Toggle
                checked={workspace.settings.pomodoro.soundEnabled}
                onChange={(v) => void patchSettings({ pomodoro: { soundEnabled: v } })}
                label={t('setChime')}
              />
            </div>
          </CardBody>
        </Card>

        {/* ------------------------------------------------------ appearance -- */}
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
                    { value: 'system', label: t('setSystem') },
                    { value: 'light', label: t('setLight') },
                    { value: 'dark', label: t('setDark') },
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
                    { value: 'compact', label: t('setCompact') },
                    { value: 'comfortable', label: t('setComfortable') },
                    { value: 'spacious', label: t('setSpacious') },
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
                      className="size-7 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: `hsl(${a.hue})`,
                        borderColor:
                          appearance.accent === a.key ? 'var(--color-foreground)' : 'transparent',
                      }}
                    />
                  ))}
                </div>
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
              />
              <StatTile
                label={t('setSchemaVersion')}
                value={`v${SCHEMA_VERSION}`}
                hint={t('setLocalDb')}
              />
              <StatTile
                label={t('setLastExport')}
                value={lastExportName ? t('setDone') : '—'}
                hint={lastExportName ?? t('setNoExportYet')}
              />
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
                  {t('setLinkFolder')}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">{t('setNoFolderLink')}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-6">
              <Toggle
                checked={exportOptions.includeAttachments}
                onChange={(v) => setExportOptions((o) => ({ ...o, includeAttachments: v }))}
                label={t('setIncludeAttachments')}
                description={t('setAttachDesc')}
              />
              <Toggle
                checked={exportOptions.includeActivity}
                onChange={(v) => setExportOptions((o) => ({ ...o, includeActivity: v }))}
                label={t('setIncludeActivity')}
              />
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
            <Button
              variant="outline"
              onClick={() =>
                void workspaceRepo
                  .resetSettings(workspace.id)
                  .then(() => toast.success(t('toastSettingsReset')))
              }
            >
              <RotateCcw className="size-4" />
              {t('setResetSettings')}
            </Button>
            <Button variant="outline" onClick={() => setResetAchievementsOpen(true)}>
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
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={async () => {
          await workspaceRepo.clearContent(workspace.id)
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
}: {
  days: WeekDay[]
  onChange: (days: WeekDay[]) => void
}) {
  const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  const order: WeekDay[] = [1, 2, 3, 4, 5, 6, 0]
  return (
    <div className="flex gap-1">
      {order.map((day, i) => {
        const selected = days.includes(day)
        return (
          <button
            key={day}
            type="button"
            aria-pressed={selected}
            aria-label={t(`wd${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]}` as TranslationKey)}
            onClick={() =>
              onChange(selected ? days.filter((x) => x !== day) : [...days, day].sort())
            }
            className={`size-7 rounded-md border text-xs font-medium transition-colors ${
              selected
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {labels[i]}
          </button>
        )
      })}
    </div>
  )
}
