/**
 * Jalali (Shamsi) Date Picker.
 *
 * A custom calendar widget that shows the Persian calendar with proper
 * month names, RTL layout, and Jalali date arithmetic. Falls back to
 * the native `<input type="date">` when the UI language is English.
 *
 * This component is a controlled input: it accepts and emits Gregorian
 * `yyyy-MM-dd` day-keys so the rest of the app doesn't need to care
 * about the active calendar system.
 */

import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/i18n'
import { cn } from '@/utils/cn'
import { toDayKey, fromDayKey } from '@/utils/date'
import {
  toJalaliParts,
  jalaliMonthName,
  jalaliDaysInMonth,
  toPersianDigits,
} from '@/utils/jalali'
import {
  setDate as jSetDate,
  setMonth as jSetMonth,
  setYear as jSetYear,
  startOfMonth as jStartOfMonth,
  getDay,
  addDays,
} from 'date-fns-jalali'

/* ---------------------------------------------------------------- helpers -- */

const JALALI_WEEKDAY_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const

/**
 * Build the grid cells for a Jalali month calendar.
 * The week starts on Saturday (6) for the Jalali calendar.
 */
function buildJalaliGrid(year: number, month: number) {
  // Set date to 1 first before setting month/year to prevent month overflow
  let firstOfMonth = jSetDate(new Date(), 1)
  firstOfMonth = jSetMonth(firstOfMonth, month - 1) // 0-based
  firstOfMonth = jSetYear(firstOfMonth, year)
  firstOfMonth = jStartOfMonth(firstOfMonth)

  // getDay returns 0=Sun,1=Mon...6=Sat
  // For Jalali we want Saturday as the first column (index 0)
  const dayOfWeek = getDay(firstOfMonth)
  // Map: Sat=0, Sun=1, Mon=2, Tue=3, Wed=4, Thu=5, Fri=6
  const saturdayOffset = (dayOfWeek + 1) % 7

  const daysInMonth = jalaliDaysInMonth(year, month)

  // Leading empty cells
  const cells: { date: Date; day: number; inMonth: boolean }[] = []

  // Previous month days
  for (let i = saturdayOffset - 1; i >= 0; i--) {
    const d = addDays(firstOfMonth, -i - 1)
    const parts = toJalaliParts(d)
    cells.push({ date: d, day: parts.day, inMonth: false })
  }

  // Current month days
  for (let i = 0; i < daysInMonth; i++) {
    const d = addDays(firstOfMonth, i)
    cells.push({ date: d, day: i + 1, inMonth: true })
  }

  // Trailing days to fill last row
  const remaining = 7 - (cells.length % 7)
  if (remaining < 7) {
    const lastDay = addDays(firstOfMonth, daysInMonth - 1)
    for (let i = 1; i <= remaining; i++) {
      const d = addDays(lastDay, i)
      const parts = toJalaliParts(d)
      cells.push({ date: d, day: parts.day, inMonth: false })
    }
  }

  return cells
}

/* ------------------------------------------------------------ date picker -- */

export interface JalaliDatePickerProps {
  /** Gregorian `yyyy-MM-dd` value, or empty string if no date selected. */
  value: string
  /** Called with a Gregorian `yyyy-MM-dd` string. */
  onChange: (value: string) => void
  /** Optional minimum date (Gregorian `yyyy-MM-dd`). */
  min?: string
  /** Optional maximum date (Gregorian `yyyy-MM-dd`). */
  max?: string
  /** Additional class for the outer wrapper. */
  className?: string
  /** Input ID for `<label htmlFor>` wiring. */
  id?: string
  /** Placeholder text */
  placeholder?: string
}

export function JalaliDatePicker({
  value,
  onChange,
  min,
  max,
  className,
  id,
  placeholder,
}: JalaliDatePickerProps) {
  const language = useI18n((s) => s.language)

  // If English, render native date input
  if (language !== 'fa') {
    return (
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
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

  return (
    <JalaliCalendarInput
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      className={className}
      id={id}
      placeholder={placeholder}
    />
  )
}

/* ----------------------------------------------------- calendar dropdown -- */

function JalaliCalendarInput({
  value,
  onChange,
  min,
  max,
  className,
  id,
  placeholder,
}: JalaliDatePickerProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // The currently viewed month/year (Jalali)
  const [viewYear, setViewYear] = useState(() => {
    if (value) {
      const parts = toJalaliParts(fromDayKey(value))
      return parts.year
    }
    return toJalaliParts(new Date()).year
  })
  const [viewMonth, setViewMonth] = useState(() => {
    if (value) {
      const parts = toJalaliParts(fromDayKey(value))
      return parts.month
    }
    return toJalaliParts(new Date()).month
  })

  // Update view when value changes externally
  useEffect(() => {
    if (value) {
      const parts = toJalaliParts(fromDayKey(value))
      setViewYear(parts.year)
      setViewMonth(parts.month)
    }
  }, [value])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const displayValue = useMemo(() => {
    if (!value) return ''
    const parts = toJalaliParts(fromDayKey(value))
    return toPersianDigits(
      `${parts.year}/${String(parts.month).padStart(2, '0')}/${String(parts.day).padStart(2, '0')}`
    )
  }, [value])

  const todayKey = toDayKey(new Date())

  const grid = useMemo(() => buildJalaliGrid(viewYear, viewMonth), [viewYear, viewMonth])

  const navigate = useCallback(
    (delta: number) => {
      let newMonth = viewMonth + delta
      let newYear = viewYear
      if (newMonth > 12) {
        newMonth = 1
        newYear += 1
      } else if (newMonth < 1) {
        newMonth = 12
        newYear -= 1
      }
      setViewMonth(newMonth)
      setViewYear(newYear)
    },
    [viewMonth, viewYear],
  )

  function handleSelect(date: Date) {
    onChange(toDayKey(date))
    setOpen(false)
  }

  function isDisabled(date: Date): boolean {
    const key = toDayKey(date)
    if (min && key < min) return true
    if (max && key > max) return true
    return false
  }

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm transition-colors',
          'hover:border-accent focus:border-accent focus:outline-none',
          !value && 'text-muted-foreground/70',
        )}
      >
        <Calendar className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-start truncate">
          {displayValue || placeholder || 'انتخاب تاریخ'}
        </span>
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1 w-72 rounded-xl border border-border bg-card p-3 shadow-xl',
            'animate-in fade-in-0 zoom-in-95',
          )}
          style={{ right: 0 }}
        >
          {/* Header: month/year nav */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-md p-1 hover:bg-muted transition-colors"
              aria-label="ماه قبل"
            >
              <ChevronRight className="size-4" />
            </button>
            <span className="text-sm font-semibold">
              {jalaliMonthName(viewMonth - 1)} {toPersianDigits(viewYear)}
            </span>
            <button
              type="button"
              onClick={() => navigate(1)}
              className="rounded-md p-1 hover:bg-muted transition-colors"
              aria-label="ماه بعد"
            >
              <ChevronLeft className="size-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {JALALI_WEEKDAY_SHORT.map((dayLabel) => (
              <div
                key={dayLabel}
                className="text-center text-[10px] font-medium text-muted-foreground py-1"
              >
                {dayLabel}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {grid.map((cell, i) => {
              const key = toDayKey(cell.date)
              const isSelected = key === value
              const isToday = key === todayKey
              const disabled = isDisabled(cell.date)
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled || !cell.inMonth}
                  onClick={() => handleSelect(cell.date)}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-lg text-xs transition-colors',
                    cell.inMonth ? 'hover:bg-muted' : 'text-muted-foreground/30',
                    isSelected && 'bg-accent text-white hover:bg-accent/90',
                    isToday && !isSelected && 'border border-accent text-accent font-bold',
                    disabled && 'opacity-30 cursor-not-allowed',
                  )}
                >
                  {toPersianDigits(cell.day)}
                </button>
              )
            })}
          </div>

          {/* Footer: today button + clear */}
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <button
              type="button"
              onClick={() => {
                const today = new Date()
                const parts = toJalaliParts(today)
                setViewYear(parts.year)
                setViewMonth(parts.month)
                handleSelect(today)
              }}
              className="text-xs text-accent hover:underline"
            >
              امروز
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                پاک کردن
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
