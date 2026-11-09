import { Sparkles, Trophy, Zap } from 'lucide-react'
import { useT } from '@/i18n'

interface MoodInsightCardProps {
  selfRating: number | null
  score: number | null
}

export function MoodInsightCard({ selfRating, score }: MoodInsightCardProps) {
  const t = useT()

  if (selfRating === null || score === null) return null

  if (selfRating <= 2 && score >= 70) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3.5 text-sm text-sky-400">
        <Sparkles className="size-5 shrink-0" />
        <span>{t('reviewsMoodInsightHighReality', { score: Math.round(score) })}</span>
      </div>
    )
  }

  if (selfRating >= 4 && score < 50) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-400">
        <Zap className="size-5 shrink-0" />
        <span>{t('reviewsMoodInsightOptimistic')}</span>
      </div>
    )
  }

  if (selfRating >= 4 && score >= 75) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-400">
        <Trophy className="size-5 shrink-0" />
        <span>{t('reviewsMoodInsightAligned')}</span>
      </div>
    )
  }

  return null
}
