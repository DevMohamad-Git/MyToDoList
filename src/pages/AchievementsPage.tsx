import { useLiveQuery } from 'dexie-react-hooks'
import { Award, Crown, Medal, Trophy } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LoadingState,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  StatTile,
} from '@/components/ui'
import { evaluateAchievements, TIER_CLASS } from '@/services/achievements'
import { achievementRepo } from '@/storage/reviewRepo'
import { useSnapshot } from '@/hooks/useSnapshot'
import { useWorkspaceId } from '@/stores/workspace'
import type { AchievementTier } from '@/types'
import { cn } from '@/utils/cn'
import { formatDate } from '@/utils/date'

/**
 * Achievements, recomputed live from the workspace snapshot.
 *
 * Unlocking is *derived*, but the earned ledger is written through
 * `achievementRepo.award` (idempotent) so earn-dates and the activity log exist
 * without ever being able to disagree with the underlying data.
 */
export function AchievementsPage() {
  const workspaceId = useWorkspaceId()
  const snapshot = useSnapshot()

  const [view, setView] = useState<'all' | 'unlocked' | 'locked'>('all')
  const [category, setCategory] = useState<'all' | 'tasks' | 'focus' | 'consistency' | 'planning' | 'goals'>('all')

  const earned = useLiveQuery(() => achievementRepo.list(workspaceId), [workspaceId]) ?? []
  const progress = useMemo(
    () => (snapshot ? evaluateAchievements(snapshot) : null),
    [snapshot],
  )

  // Persist newly unlocked achievements once per evaluation pass. `award` is
  // idempotent, so this converges instead of duplicating rows.
  const [synced, setSynced] = useState(false)
  useEffect(() => {
    if (!progress) return
    if (synced) return
    setSynced(true)
    void (async () => {
      for (const item of progress) {
        if (item.unlocked) {
          await achievementRepo.award(workspaceId, item.definition.key, item.value, item.definition.title)
        }
      }
    })()
  }, [progress, synced, workspaceId])

  const earnedByKey = useMemo(
    () => new Map(earned.map((e) => [e.achievementKey, e])),
    [earned],
  )

  const visible = useMemo(() => {
    if (!progress) return []
    return progress.filter((item) => {
      if (category !== 'all' && item.definition.category !== category) return false
      if (view === 'unlocked') return item.unlocked
      if (view === 'locked') return !item.unlocked
      return true
    })
  }, [progress, view, category])

  if (!progress) return <LoadingState label="Checking your achievements…" />

  const unlockedCount = progress.filter((p) => p.unlocked).length
  const byTier = (tier: AchievementTier) => progress.filter((p) => p.unlocked && p.definition.tier === tier).length

  return (
    <>
      <PageHeader
        title="Achievements"
        description="Derived from your real history — importing your data re-earns them, deleting it un-earns them."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Unlocked"
          value={`${unlockedCount}/${progress.length}`}
          tone="accent"
          hint={`${Math.round((unlockedCount / progress.length) * 100)}% of the catalogue`}
          icon={<Trophy className="size-4" />}
        />
        <StatTile label="Bronze" value={byTier('bronze')} icon={<Medal className="size-4" />} />
        <StatTile label="Silver" value={byTier('silver')} icon={<Medal className="size-4" />} />
        <StatTile label="Gold" value={byTier('gold')} icon={<Award className="size-4" />} />
        <StatTile label="Platinum" value={byTier('platinum')} icon={<Crown className="size-4" />} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SegmentedControl
          value={view}
          options={[
            { value: 'all', label: 'All' },
            { value: 'unlocked', label: `Unlocked (${unlockedCount})` },
            { value: 'locked', label: `Locked (${progress.length - unlockedCount})` },
          ]}
          onChange={setView}
        />
        <SegmentedControl
          value={category}
          options={[
            { value: 'all', label: 'Everything' },
            { value: 'tasks', label: 'Tasks' },
            { value: 'focus', label: 'Focus' },
            { value: 'consistency', label: 'Consistency' },
            { value: 'planning', label: 'Planning' },
            { value: 'goals', label: 'Goals' },
          ]}
          onChange={setCategory}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Trophy className="size-8" />}
          title="Nothing in this filter"
          description="Complete work, run focus sessions and keep streaks alive to light these up."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => {
            const earnedAt = earnedByKey.get(item.definition.key)
            return (
              <Card key={item.definition.key} className={cn(!item.unlocked && 'opacity-80')}>
                <CardHeader
                  title={item.definition.title}
                  description={item.definition.description}
                  icon={<span className="text-lg">{tierIcon(item.definition.tier)}</span>}
                  actions={
                    <Badge className={TIER_CLASS[item.definition.tier]}>{item.definition.tier}</Badge>
                  }
                />
                <CardBody>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">
                      {item.value.toLocaleString()} / {item.target.toLocaleString()}
                    </span>
                    <span className="font-medium tabular-nums">{item.percent}%</span>
                  </div>
                  <ProgressBar
                    value={item.percent}
                    barClassName={item.unlocked ? undefined : 'bg-muted-foreground/40'}
                  />
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {item.unlocked
                      ? earnedAt
                        ? `Unlocked ${formatDate(earnedAt.earnedAt)}`
                        : 'Unlocked — syncing…'
                      : `Category: ${item.definition.category}`}
                  </p>
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

function tierIcon(tier: AchievementTier): string {
  switch (tier) {
    case 'bronze':
      return '🥉'
    case 'silver':
      return '🥈'
    case 'gold':
      return '🥇'
    case 'platinum':
      return '💠'
  }
}
