/**
 * Jalali DateTime Picker.
 *
 * Combines the Jalali calendar date picker with time input.
 * When language is English, falls back to native `<input type="datetime-local">`.
 *
 * Accepts and emits ISO datetime-local strings (`yyyy-MM-ddTHH:mm`) in
 * Gregorian format so the rest of the app doesn't need conversion.
 */

import { useI18n } from '@/i18n'
import { cn } from '@/utils/cn'
import { toDayKey } from '@/utils/date'
import { JalaliDatePicker } from './JalaliDatePicker'
import { JalaliTimePicker } from './JalaliTimePicker'

export interface JalaliDateTimePickerProps {
  /** Gregorian datetime-local string `yyyy-MM-ddTHH:mm`, or empty. */
  value: string
  /** Called with a Gregorian datetime-local string. */
  onChange: (value: string) => void
  /** Additional class for the outer wrapper. */
  className?: string
  /** Input ID for `<label htmlFor>` wiring. */
  id?: string
}

export function JalaliDateTimePicker({
  value,
  onChange,
  className,
  id,
}: JalaliDateTimePickerProps) {
  const language = useI18n((s) => s.language)

  // If English, render native datetime-local input
  if (language !== 'fa') {
    return (
      <input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors',
          'placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      />
    )
  }

  // Split value into date and time parts
  const [datePart, timePart] = value ? value.split('T') : ['', '']

  function handleDateChange(newDate: string) {
    if (!newDate) {
      onChange('')
      return
    }
    onChange(timePart ? `${newDate}T${timePart}` : newDate)
  }

  function handleTimeChange(newTime: string) {
    if (!newTime) {
      if (datePart) onChange(datePart)
      else onChange('')
      return
    }
    const d = datePart || toDayKey(new Date())
    onChange(`${d}T${newTime}`)
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <JalaliDatePicker
        id={id}
        value={datePart}
        onChange={handleDateChange}
        className="flex-1"
        placeholder="تاریخ"
      />
      <JalaliTimePicker
        id={id ? `${id}-time` : undefined}
        value={timePart || ''}
        onChange={handleTimeChange}
        placeholder="ساعت"
      />
    </div>
  )
}
