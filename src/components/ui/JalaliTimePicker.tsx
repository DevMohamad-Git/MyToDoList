/**
 * Jalali (Persian) Time Picker.
 *
 * A specialized time picker widget tailored for Persian / Solar Hijri UI.
 * Displays time using Persian digits (e.g. ۱۴:۳۰), provides quick presets
 * (now, morning, noon, evening, night), and interactive Persian hour and
 * minute selector columns.
 *
 * Emits standard 24-hour time strings (`HH:mm`) so internal storage and
 * date calculations remain completely standard and robust.
 * Falls back to native `<input type="time">` when UI language is English.
 */

import { Clock, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/i18n'
import { cn } from '@/utils/cn'
import { toPersianDigits } from '@/utils/jalali'

export interface JalaliTimePickerProps {
  /** 24-hour time string `HH:mm`, or empty string. */
  value: string
  /** Called with the updated `HH:mm` time string, or empty string. */
  onChange: (value: string) => void
  /** Additional class for outer wrapper. */
  className?: string
  /** Input ID for `<label htmlFor>` wiring. */
  id?: string
  /** Placeholder text when empty. */
  placeholder?: string
  /** Whether the control is disabled. */
  disabled?: boolean
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

const PRESETS = [
  { label: 'اکنون', time: 'now', desc: 'زمان فعلی' },
  { label: '۰۹:۰۰', time: '09:00', desc: 'صبح' },
  { label: '۱۲:۰۰', time: '12:00', desc: 'ظهر' },
  { label: '۱۶:۰۰', time: '16:00', desc: 'عصر' },
  { label: '۲۰:۰۰', time: '20:00', desc: 'شب' },
] as const

export function JalaliTimePicker({
  value,
  onChange,
  className,
  id,
  placeholder = 'ساعت',
  disabled,
}: JalaliTimePickerProps) {
  const language = useI18n((s) => s.language)

  // English fallback: render native HTML5 time input
  if (language !== 'fa') {
    return (
      <input
        id={id}
        type="time"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-9 w-28 shrink-0 rounded-lg border border-input bg-background px-2 text-sm text-center transition-colors',
          'placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      />
    )
  }

  return (
    <PersianTimePickerWidget
      value={value}
      onChange={onChange}
      className={className}
      id={id}
      placeholder={placeholder}
      disabled={disabled}
    />
  )
}

function PersianTimePickerWidget({
  value,
  onChange,
  className,
  id,
  placeholder,
  disabled,
}: JalaliTimePickerProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const hourScrollRef = useRef<HTMLDivElement>(null)
  const minuteScrollRef = useRef<HTMLDivElement>(null)

  const [selectedHour, selectedMinute] = useMemo(() => {
    if (!value || !value.includes(':')) return ['', '']
    const [h, m] = value.split(':')
    return [h.padStart(2, '0'), m.padStart(2, '0')]
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

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // Auto-scroll columns to center the selected/current time
  useEffect(() => {
    if (!open) return
    const now = new Date()
    const targetH = selectedHour || String(now.getHours()).padStart(2, '0')
    const targetM =
      selectedMinute || String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0')

    const animId = requestAnimationFrame(() => {
      const hEl = hourScrollRef.current?.querySelector<HTMLElement>(`[data-hour="${targetH}"]`)
      const mEl = minuteScrollRef.current?.querySelector<HTMLElement>(`[data-minute="${targetM}"]`)
      hEl?.scrollIntoView({ block: 'center' })
      mEl?.scrollIntoView({ block: 'center' })
    })

    return () => cancelAnimationFrame(animId)
  }, [open, selectedHour, selectedMinute])

  function handleSelectHour(h: string) {
    const m = selectedMinute || '00'
    onChange(`${h}:${m}`)
  }

  function handleSelectMinute(m: string) {
    const now = new Date()
    const h = selectedHour || String(now.getHours()).padStart(2, '0')
    onChange(`${h}:${m}`)
  }

  function handleNow() {
    const now = new Date()
    const h = String(now.getHours()).padStart(2, '0')
    const m = String(now.getMinutes()).padStart(2, '0')
    onChange(`${h}:${m}`)
    setOpen(false)
  }

  const displayLabel = value ? toPersianDigits(value) : placeholder

  return (
    <div ref={wrapperRef} className={cn('relative w-28 shrink-0', className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-background px-2.5 text-sm transition-colors',
          'hover:border-accent focus:border-accent focus:outline-none',
          !value && 'text-muted-foreground/70',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <Clock className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-center font-medium">
          {displayLabel}
        </span>
        {value ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onChange('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                onChange('')
              }
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="پاک کردن ساعت"
          >
            <X className="size-3" />
          </span>
        ) : null}
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1 w-64 rounded-xl border border-border bg-card p-3 shadow-xl',
            'animate-in fade-in-0 zoom-in-95',
          )}
          style={{ left: 0 }}
        >
          {/* Header */}
          <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Clock className="size-3.5 text-accent" />
              <span>انتخاب ساعت</span>
            </div>
            {value ? (
              <span className="rounded-md bg-accent/10 px-2 py-0.5 font-mono text-xs font-bold text-accent">
                {toPersianDigits(value)}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">انتخاب نشده</span>
            )}
          </div>

          {/* Quick presets */}
          <div className="mb-2.5 flex flex-wrap gap-1">
            {PRESETS.map((p) => {
              const isActive = p.time !== 'now' && value === p.time
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    if (p.time === 'now') {
                      handleNow()
                    } else {
                      onChange(p.time)
                      setOpen(false)
                    }
                  }}
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground font-bold'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  title={p.desc}
                >
                  {p.label}
                </button>
              )
            })}
          </div>

          {/* Columns: Hour & Minute */}
          <div className="grid grid-cols-2 gap-2 text-center" dir="rtl">
            {/* Hour Column */}
            <div className="flex flex-col">
              <span className="mb-1 text-[11px] font-semibold text-muted-foreground">
                ساعت
              </span>
              <div
                ref={hourScrollRef}
                className="flex max-h-40 flex-col gap-0.5 overflow-y-auto rounded-lg border border-border/60 bg-muted/20 p-1"
              >
                {HOURS.map((h) => {
                  const isSelected = selectedHour === h
                  return (
                    <button
                      key={h}
                      data-hour={h}
                      type="button"
                      onClick={() => handleSelectHour(h)}
                      className={cn(
                        'rounded-md py-1 text-xs font-medium transition-colors',
                        isSelected
                          ? 'bg-accent text-accent-foreground font-bold shadow-xs'
                          : 'text-foreground hover:bg-muted',
                      )}
                    >
                      {toPersianDigits(h)}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Minute Column */}
            <div className="flex flex-col">
              <span className="mb-1 text-[11px] font-semibold text-muted-foreground">
                دقیقه
              </span>
              <div
                ref={minuteScrollRef}
                className="flex max-h-40 flex-col gap-0.5 overflow-y-auto rounded-lg border border-border/60 bg-muted/20 p-1"
              >
                {MINUTES.map((m) => {
                  const isSelected = selectedMinute === m
                  const isMultipleOf5 = Number(m) % 5 === 0
                  return (
                    <button
                      key={m}
                      data-minute={m}
                      type="button"
                      onClick={() => handleSelectMinute(m)}
                      className={cn(
                        'rounded-md py-1 text-xs transition-colors',
                        isSelected
                          ? 'bg-accent text-accent-foreground font-bold shadow-xs'
                          : isMultipleOf5
                            ? 'font-medium text-foreground hover:bg-muted'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {toPersianDigits(m)}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2 text-xs">
            <button
              type="button"
              onClick={handleNow}
              className="text-accent hover:underline font-medium"
            >
              اکنون
            </button>
            <div className="flex items-center gap-2">
              {value ? (
                <button
                  type="button"
                  onClick={() => {
                    onChange('')
                    setOpen(false)
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  پاک کردن
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-accent px-2.5 py-0.5 text-accent-foreground font-medium hover:bg-accent/90"
              >
                تأیید
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
