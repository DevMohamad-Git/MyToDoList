import { useLiveQuery } from 'dexie-react-hooks'
import {
  Award,
  Brain,
  CalendarCheck,
  CheckCircle2,
  Crown,
  Flame,
  FolderPlus,
  Inbox,
  Medal,
  NotebookPen,
  PackageCheck,
  Repeat,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  Timer,
  Trophy,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  Select,
  StatTile,
  toast,
} from '@/components/ui'
import {
  computeLevelInfo,
  evaluateAchievements,
  TIER_CLASS,
  type AchievementProgress,
} from '@/services/achievements'
import { achievementRepo } from '@/storage/reviewRepo'
import { useSnapshot } from '@/hooks/useSnapshot'
import { useWorkspaceId } from '@/stores/workspace'
import { useT, type TranslationKey } from '@/i18n'
import type { AchievementTier } from '@/types'
import { cn } from '@/utils/cn'
import { formatDate } from '@/utils/date'

type ViewFilter = 'all' | 'unlocked' | 'locked'
type CategoryFilter = 'all' | 'tasks' | 'focus' | 'consistency' | 'planning' | 'goals'
type SortOption = 'closest' | 'recent' | 'tier' | 'name'

const TIER_BG: Record<AchievementTier, string> = {
  bronze: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  silver: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20',
  gold: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
  platinum: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/20',
}

const TIER_ORDER: Record<AchievementTier, number> = {
  platinum: 4,
  gold: 3,
  silver: 2,
  bronze: 1,
}

/**
 * Achievements: Gamification, progress reflection & motivation engine.
 *
 * Senior Architecture Upgrades:
 * 1. Performance: O(1) indexed computations eliminate previous O(D x T) bottlenecks.
 * 2. Atomic Database Sync: Batch synchronization via `syncUnlocked` with race-condition prevention.
 * 3. Gamified XP & Level Progression: Dynamic XP scoring, Level titles, and progress visualization.
 * 4. "Almost There" Spotlight: Real-time highlights of near-completion milestones (60%-99%).
 * 5. Full Bilingual i18n & RTL: Comprehensive Persian & English support with localized date formatting.
 * 6. Advanced Discovery: Search, category filtering, and multi-mode sorting.
 */
export function AchievementsPage() {
  const t = useT()
  const workspaceId = useWorkspaceId()
  const snapshot = useSnapshot()

  const [view, setView] = useState<ViewFilter>('all')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('closest')

  // Reactive DB ledger for earn-dates
  const earned = useLiveQuery(() => achievementRepo.list(workspaceId), [workspaceId]) ?? []

  // High-performance evaluation with precomputed index
  const progress = useMemo(
    () => (snapshot ? evaluateAchievements(snapshot) : null),
    [snapshot],
  )

  // XP & Level computation
  const levelInfo = useMemo(
    () => (progress ? computeLevelInfo(progress) : null),
    [progress],
  )

  // Map of earned achievements for quick earn-date lookup
  const earnedByKey = useMemo(
    () => new Map(earned.map((e) => [e.achievementKey, e])),
    [earned],
  )

  // Atomic sync of newly unlocked achievements
  const syncedKeysRef = useRef<Set<string>>(new Set())

  // Keep syncedKeys in sync with database ledger
  useEffect(() => {
    syncedKeysRef.current = new Set(earned.map((e) => e.achievementKey))
  }, [earned])

  // Batch sync newly unlocked achievements without render-blocking loops
  useEffect(() => {
    if (!progress || progress.length === 0) return

    const newlyUnlocked = progress
      .filter((item) => item.unlocked && !syncedKeysRef.current.has(item.definition.key))
      .map((item) => ({
        key: item.definition.key,
        value: item.value,
        title: t(item.definition.titleKey),
      }))

    if (newlyUnlocked.length === 0) return

    // Immediately record locally to avoid duplicate trigger
    for (const item of newlyUnlocked) {
      syncedKeysRef.current.add(item.key)
    }

    void (async () => {
      const awarded = await achievementRepo.syncUnlocked(workspaceId, newlyUnlocked)
      if (awarded.length > 0) {
        for (const item of awarded) {
          const def = progress.find((p) => p.definition.key === item.achievementKey)
          const title = def ? t(def.definition.titleKey) : item.achievementKey
          const xp = def ? def.xp : 50
          toast.success(t('achievementsToastUnlocked', { title, xp }))
        }
      }
    })()
  }, [progress, workspaceId, t])

  // "Almost There" Spotlight: Achievements between 50% and 99%
  const almostThere = useMemo(() => {
    if (!progress) return []
    return progress
      .filter((p) => !p.unlocked && p.percent >= 50 && p.percent < 100)
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 3)
  }, [progress])

  // Filtered & Sorted list
  const visible = useMemo(() => {
    if (!progress) return []
    const q = search.trim().toLowerCase()

    const filtered = progress.filter((item) => {
      if (category !== 'all' && item.definition.category !== category) return false
      if (view === 'unlocked' && !item.unlocked) return false
      if (view === 'locked' && item.unlocked) return false

      if (q) {
        const title = t(item.definition.titleKey).toLowerCase()
        const desc = t(item.definition.descKey).toLowerCase()
        if (!title.includes(q) && !desc.includes(q) && !item.definition.key.toLowerCase().includes(q)) {
          return false
        }
      }
      return true
    })

    return filtered.sort((a, b) => {
      if (sortBy === 'closest') {
        // Unlocked first, then highest percent
        if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1
        return b.percent - a.percent
      }
      if (sortBy === 'recent') {
        const aEarned = earnedByKey.get(a.definition.key)?.earnedAt ?? ''
        const bEarned = earnedByKey.get(b.definition.key)?.earnedAt ?? ''
        if (aEarned && bEarned) return bEarned.localeCompare(aEarned)
        if (aEarned) return -1
        if (bEarned) return 1
        return b.percent - a.percent
      }
      if (sortBy === 'tier') {
        const diff = TIER_ORDER[b.definition.tier] - TIER_ORDER[a.definition.tier]
        if (diff !== 0) return diff
        return b.percent - a.percent
      }
      if (sortBy === 'name') {
        return t(a.definition.titleKey).localeCompare(t(b.definition.titleKey))
      }
      return 0
    })
  }, [progress, view, category, search, sortBy, t, earnedByKey])

  if (!progress || !levelInfo) return <LoadingState label={t('cLoading')} />

  const unlockedCount = progress.filter((p) => p.unlocked).length
  const byTier = (tier: AchievementTier) =>
    progress.filter((p) => p.unlocked && p.definition.tier === tier).length

  return (
    <>
      <PageHeader
        title={t('achievementsTitle')}
        description={t('achievementsDesc')}
      />

      {/* Gamified Level & XP Hero Banner */}
      <Card className="mb-4 overflow-hidden border-accent/20 bg-gradient-to-r from-accent/5 via-background to-accent/10">
        <CardBody className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3.5">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent ring-4 ring-accent/10">
                <Trophy className="size-7" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-accent/30 bg-accent/15 font-bold text-accent">
                    {t('achievementsLevel', { level: levelInfo.level })}
                  </Badge>
                  <span className="text-base font-semibold text-foreground">
                    {t(levelInfo.titleKey)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('achievementsTotalXp')}:{' '}
                  <span className="font-semibold text-foreground tabular-nums">
                    {levelInfo.totalEarnedXp.toLocaleString()}
                  </span>{' '}
                  / {levelInfo.totalCatalogueXp.toLocaleString()} XP
                </p>
              </div>
            </div>

            <div className="w-full sm:max-w-xs">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {levelInfo.isMaxLevel
                    ? t('achievementsMaxLevel')
                    : t('achievementsXpToNext', {
                        xp: levelInfo.xpForNextLevel.toLocaleString(),
                      })}
                </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {levelInfo.progressPercent}%
                </span>
              </div>
              <ProgressBar value={levelInfo.progressPercent} barClassName="bg-accent" />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Quick Statistics Grid */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label={t('achievementsUnlockedStat')}
          value={`${unlockedCount}/${progress.length}`}
          tone="accent"
          hint={t('achievementsCatalogueHint', {
            percent: Math.round((unlockedCount / progress.length) * 100),
          })}
          icon={<Trophy className="size-4" />}
        />
        <StatTile
          label={t('achievementsTierBronze')}
          value={byTier('bronze')}
          icon={<Medal className="size-4 text-amber-500" />}
        />
        <StatTile
          label={t('achievementsTierSilver')}
          value={byTier('silver')}
          icon={<Medal className="size-4 text-slate-400" />}
        />
        <StatTile
          label={t('achievementsTierGold')}
          value={byTier('gold')}
          icon={<Award className="size-4 text-yellow-500" />}
        />
        <StatTile
          label={t('achievementsTierPlatinum')}
          value={byTier('platinum')}
          icon={<Crown className="size-4 text-cyan-400" />}
        />
      </div>

      {/* "Almost There" Spotlight Section */}
      {almostThere.length > 0 && view !== 'unlocked' && (
        <div className="mb-5 rounded-xl border border-accent/20 bg-accent/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Sparkles className="size-4 text-amber-500" />
                {t('achievementsAlmostThereTitle')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('achievementsAlmostThereDesc')}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {almostThere.map((item) => (
              <div
                key={item.definition.key}
                className="flex flex-col justify-between rounded-lg border border-border bg-card p-3 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-lg border',
                        TIER_BG[item.definition.tier],
                      )}
                    >
                      {getAchievementIcon(item.definition.key, item.definition.tier)}
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold leading-tight text-foreground">
                        {t(item.definition.titleKey)}
                      </h4>
                      <span className="text-[11px] text-muted-foreground">
                        {t(item.definition.descKey)}
                      </span>
                    </div>
                  </div>
                  <Badge className={TIER_CLASS[item.definition.tier]}>
                    {t('achievementsXpBadge', { xp: item.xp })}
                  </Badge>
                </div>
                <div className="mt-2.5">
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground tabular-nums">
                      {item.value.toLocaleString()} / {item.target.toLocaleString()}
                    </span>
                    <span className="font-semibold text-accent tabular-nums">
                      {item.percent}%
                    </span>
                  </div>
                  <ProgressBar value={item.percent} barClassName="bg-amber-500" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter, Search & Sort Toolbar */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            value={view}
            options={[
              { value: 'all', label: t('achievementsViewAll') },
              { value: 'unlocked', label: t('achievementsViewUnlocked', { count: unlockedCount }) },
              {
                value: 'locked',
                label: t('achievementsViewLocked', { count: progress.length - unlockedCount }),
              },
            ]}
            onChange={setView}
          />
          <SegmentedControl
            value={category}
            options={[
              { value: 'all', label: t('achievementsCatAll') },
              { value: 'tasks', label: t('achievementsCatTasks') },
              { value: 'focus', label: t('achievementsCatFocus') },
              { value: 'consistency', label: t('achievementsCatConsistency') },
              { value: 'planning', label: t('achievementsCatPlanning') },
              { value: 'goals', label: t('achievementsCatGoals') },
            ]}
            onChange={setCategory}
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-44 flex-1 sm:w-60 sm:flex-initial">
            <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('achievementsSearchPlaceholder')}
              className="ps-8 text-xs"
            />
          </div>
          <div className="relative shrink-0">
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="text-xs"
            >
              <option value="closest">{t('achievementsSortClosest')}</option>
              <option value="recent">{t('achievementsSortRecent')}</option>
              <option value="tier">{t('achievementsSortTier')}</option>
              <option value="name">{t('achievementsSortName')}</option>
            </Select>
          </div>
        </div>
      </div>

      {/* Main Achievement Cards Grid */}
      {visible.length === 0 ? (
        <EmptyState
          icon={<Trophy className="size-8 text-muted-foreground" />}
          title={t('achievementsEmptyTitle')}
          description={t('achievementsEmptyDesc')}
          action={
            (search || view !== 'all' || category !== 'all') ? (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setView('all')
                  setCategory('all')
                }}
                className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <RotateCcw className="size-3" />
                {t('cAll')}
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => {
            const earnedAt = earnedByKey.get(item.definition.key)
            return (
              <AchievementCard
                key={item.definition.key}
                item={item}
                earnedAt={earnedAt?.earnedAt}
              />
            )
          })}
        </div>
      )}
    </>
  )
}

function AchievementCard({
  item,
  earnedAt,
}: {
  item: AchievementProgress
  earnedAt?: string
}) {
  const t = useT()

  return (
    <Card
      className={cn(
        'transition-all duration-200',
        item.unlocked
          ? 'border-border/80 bg-card shadow-xs hover:border-accent/40'
          : 'border-border/40 bg-card/60 opacity-85 hover:opacity-100',
      )}
    >
      <CardHeader
        title={t(item.definition.titleKey)}
        description={t(item.definition.descKey)}
        icon={
          <div
            className={cn(
              'flex size-9 items-center justify-center rounded-lg border transition-colors',
              TIER_BG[item.definition.tier],
              !item.unlocked && 'grayscale-[40%]',
            )}
          >
            {getAchievementIcon(item.definition.key, item.definition.tier)}
          </div>
        }
        actions={
          <div className="flex items-center gap-1.5">
            <Badge className={TIER_CLASS[item.definition.tier]}>
              {t(getTierLabelKey(item.definition.tier))}
            </Badge>
            <Badge
              className={
                item.unlocked
                  ? 'border-accent/30 bg-accent/15 text-accent'
                  : 'border-border/60 text-muted-foreground'
              }
            >
              {t('achievementsXpBadge', { xp: item.xp })}
            </Badge>
          </div>
        }
      />
      <CardBody>
        <div className="mb-1 flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground tabular-nums">
            {item.value.toLocaleString()} / {item.target.toLocaleString()}
          </span>
          <span className="font-semibold tabular-nums text-foreground">
            {item.percent}%
          </span>
        </div>
        <ProgressBar
          value={item.percent}
          barClassName={item.unlocked ? 'bg-accent' : 'bg-muted-foreground/30'}
        />
        <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {item.unlocked ? (
              earnedAt ? (
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  ✓ {t('achievementsUnlockedAt', { date: formatDate(earnedAt) })}
                </span>
              ) : (
                t('achievementsSyncing')
              )
            ) : (
              t('achievementsCategoryLabel', {
                category: t(getCategoryLabelKey(item.definition.category)),
              })
            )}
          </span>
        </div>
      </CardBody>
    </Card>
  )
}

function getTierLabelKey(tier: AchievementTier): TranslationKey {
  switch (tier) {
    case 'bronze':
      return 'achievementsTierBronze'
    case 'silver':
      return 'achievementsTierSilver'
    case 'gold':
      return 'achievementsTierGold'
    case 'platinum':
      return 'achievementsTierPlatinum'
  }
}

function getCategoryLabelKey(
  cat: 'tasks' | 'focus' | 'consistency' | 'planning' | 'goals',
): TranslationKey {
  switch (cat) {
    case 'tasks':
      return 'achievementsCatTasks'
    case 'focus':
      return 'achievementsCatFocus'
    case 'consistency':
      return 'achievementsCatConsistency'
    case 'planning':
      return 'achievementsCatPlanning'
    case 'goals':
      return 'achievementsCatGoals'
  }
}

function getAchievementIcon(key: string, tier: AchievementTier) {
  switch (key) {
    case 'first_task':
    case 'tasks_10':
    case 'tasks_50':
    case 'tasks_100':
    case 'tasks_500':
      return tier === 'platinum' ? (
        <Crown className="size-5" />
      ) : (
        <CheckCircle2 className="size-5" />
      )
    case 'first_project':
      return <FolderPlus className="size-5" />
    case 'project_completed':
      return <PackageCheck className="size-5" />
    case 'first_focus':
    case 'pomodoro_25':
      return <Timer className="size-5" />
    case 'focus_10h':
      return <Brain className="size-5" />
    case 'focus_50h':
      return <Zap className="size-5" />
    case 'streak_7':
    case 'streak_14':
    case 'streak_30':
      return <Flame className="size-5" />
    case 'deadline_master':
      return <CalendarCheck className="size-5" />
    case 'perfect_day':
      return <Sparkles className="size-5" />
    case 'reviewer_7':
      return <NotebookPen className="size-5" />
    case 'habit_streak_21':
      return <Repeat className="size-5" />
    case 'goal_achieved':
      return <Target className="size-5" />
    case 'inbox_zero':
      return <Inbox className="size-5" />
    default:
      return <Award className="size-5" />
  }
}
