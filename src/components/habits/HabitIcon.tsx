import {
  Activity,
  Apple,
  BookOpen,
  Brain,
  Check,
  Coffee,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  Heart,
  Laptop,
  Moon,
  Music,
  Repeat,
  Smile,
  Sparkles,
  Sun,
  Target,
  Timer,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '@/utils/cn'

export interface HabitIconDef {
  id: string
  faLabel: string
  enLabel: string
  Icon: LucideIcon
}

export const HABIT_ICONS: HabitIconDef[] = [
  { id: 'flame', faLabel: 'انرژی / عمومی', enLabel: 'Energy / General', Icon: Flame },
  { id: 'book', faLabel: 'مطالعه و کتاب', enLabel: 'Reading & Books', Icon: BookOpen },
  { id: 'droplets', faLabel: 'نوشیدن آب', enLabel: 'Water & Hydration', Icon: Droplets },
  { id: 'dumbbell', faLabel: 'ورزش و بدنسازی', enLabel: 'Workout & Fitness', Icon: Dumbbell },
  { id: 'heart', faLabel: 'سلامت و خودآگاهی', enLabel: 'Health & Wellness', Icon: Heart },
  { id: 'brain', faLabel: 'تمرکز و ذهن', enLabel: 'Focus & Mind', Icon: Brain },
  { id: 'sun', faLabel: 'روتین صبحگاهی', enLabel: 'Morning Routine', Icon: Sun },
  { id: 'moon', faLabel: 'روتین شب و خواب', enLabel: 'Night & Sleep', Icon: Moon },
  { id: 'laptop', faLabel: 'کار عمیق و کد', enLabel: 'Work & Code', Icon: Laptop },
  { id: 'apple', faLabel: 'تغذیه سالم', enLabel: 'Nutrition & Diet', Icon: Apple },
  { id: 'footprints', faLabel: 'پیاده‌روی و قدم', enLabel: 'Walking & Steps', Icon: Footprints },
  { id: 'coffee', faLabel: 'کنترل کافئین', enLabel: 'Coffee & Drinks', Icon: Coffee },
  { id: 'target', faLabel: 'هدفگذاری', enLabel: 'Target & Goal', Icon: Target },
  { id: 'sparkles', faLabel: 'انگیزه و شادابی', enLabel: 'Sparkles & Magic', Icon: Sparkles },
  { id: 'timer', faLabel: 'مدیریت زمان', enLabel: 'Timer & Time', Icon: Timer },
  { id: 'zap', faLabel: 'بهره‌وری سریع', enLabel: 'Productivity', Icon: Zap },
  { id: 'music', faLabel: 'موسیقی و هنر', enLabel: 'Music & Art', Icon: Music },
  { id: 'smile', faLabel: 'حس خوب و شکرگزاری', enLabel: 'Mood & Gratitude', Icon: Smile },
  { id: 'activity', faLabel: 'تحرک و پویا بودن', enLabel: 'Activity', Icon: Activity },
  { id: 'check', faLabel: 'تیک و انجام', enLabel: 'Check & Done', Icon: Check },
  { id: 'repeat', faLabel: 'استمرار و تکرار', enLabel: 'Repeat & Habit', Icon: Repeat },
]

const ICON_MAP = new Map<string, LucideIcon>(HABIT_ICONS.map((i) => [i.id, i.Icon]))

export function HabitIcon({
  icon,
  className = 'size-4',
  fallback: Fallback = Flame,
}: {
  icon?: string
  className?: string
  fallback?: LucideIcon
}) {
  if (!icon) return <Fallback className={className} />

  // If icon is an emoji (contains non-ascii or emoji characters)
  if (/\p{Emoji}/u.test(icon) && !ICON_MAP.has(icon)) {
    return (
      <span className={cn('inline-flex items-center justify-center leading-none select-none text-base', className)}>
        {icon}
      </span>
    )
  }

  const Matched = ICON_MAP.get(icon.toLowerCase()) ?? Fallback
  return <Matched className={className} />
}

export function HabitIconPicker({
  value,
  onChange,
  language = 'fa',
}: {
  value: string
  onChange: (id: string) => void
  language?: 'fa' | 'en'
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-7">
        {HABIT_ICONS.map(({ id, faLabel, enLabel, Icon }) => {
          const selected = value === id
          const label = language === 'fa' ? faLabel : enLabel
          return (
            <button
              key={id}
              type="button"
              title={label}
              onClick={() => onChange(id)}
              className={cn(
                'flex aspect-square items-center justify-center rounded-lg border text-sm transition-all',
                selected
                  ? 'border-accent bg-accent/15 text-accent shadow-sm ring-1 ring-accent'
                  : 'border-border/60 text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
