import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button, JalaliDatePicker } from '@/components/ui'
import { useT } from '@/i18n'
import type { DayKey } from '@/types'
import { cn } from '@/utils/cn'
import { addDays, fromDayKey, toDayKey } from '@/utils/date'

interface DayNavProps {
  day: DayKey
  setDay: (d: DayKey) => void
}

export function DayNav({ day, setDay }: DayNavProps) {
  const t = useT()
  const todayStr = toDayKey(new Date())
  const isToday = day === todayStr

  function shift(delta: number) {
    const nextDay = toDayKey(addDays(fromDayKey(day), delta))
    if (delta > 0 && nextDay > todayStr) return
    setDay(nextDay)
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon"
        aria-label={t('reviewsDayNavPrev')}
        onClick={() => shift(-1)}
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
      </Button>
      <JalaliDatePicker
        value={day}
        max={todayStr}
        onChange={(v) => v && setDay(v)}
        className="w-44"
      />
      <Button
        variant="outline"
        size="icon"
        aria-label={t('reviewsDayNavNext')}
        disabled={day >= todayStr}
        onClick={() => shift(1)}
      >
        <ArrowRight className="size-4 rtl:rotate-180" />
      </Button>

      {/* Prominent Today button */}
      <Button
        variant={isToday ? 'ghost' : 'primary'}
        size="sm"
        disabled={isToday}
        onClick={() => setDay(todayStr)}
        className={cn(
          'text-xs transition-all',
          !isToday && 'font-bold shadow-sm bg-accent text-accent-foreground hover:bg-accent/90',
          isToday && 'text-muted-foreground opacity-60',
        )}
        title={isToday ? 'هم‌اکنون در تاریخ امروز هستید' : 'پرش به مرور امروز'}
      >
        {isToday ? 'امروز' : 'بازگشت به امروز'}
      </Button>
    </div>
  )
}
