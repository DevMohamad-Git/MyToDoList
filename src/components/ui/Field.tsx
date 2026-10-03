import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { useId } from 'react'
import { cn } from '@/utils/cn'

const CONTROL =
  'w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors ' +
  'placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

/** Label + control + hint/error wrapper. Wires `htmlFor` automatically. */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  htmlFor,
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  children: ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
          {label}
          {required ? <span className="ms-0.5 text-rose-400">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs text-rose-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, 'h-9', className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, 'min-h-20 resize-y py-2 leading-relaxed', className)} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, 'h-9 cursor-pointer appearance-none pe-8', className)} {...props}>
      {children}
    </select>
  )
}

/** Select bound to a list of options; keeps call sites free of <option> noise. */
export function OptionSelect<T extends string>({
  value,
  options,
  onChange,
  className,
  placeholder,
  ...rest
}: {
  value: T | ''
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  placeholder?: string
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange' | 'children'>) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={className}
      {...rest}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  )
}

export function Checkbox({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  const id = useId()
  const inputId = props.id ?? id
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        id={inputId}
        type="checkbox"
        className="size-4 shrink-0 cursor-pointer rounded border-input accent-[var(--color-accent)]"
        {...props}
      />
      {label ? (
        <label htmlFor={inputId} className="cursor-pointer text-sm select-none">
          {label}
        </label>
      ) : null}
    </div>
  )
}

/** Accessible on/off switch for settings rows. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description ? (
          <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-accent' : 'bg-muted border border-border',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-0.5 rtl:-translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}

/** Range slider with a live numeric readout; used by the scoring-weight editor. */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  suffix,
  className,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  label?: ReactNode
  suffix?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label ? (
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium tabular-nums">
            {value}
            {suffix}
          </span>
        </div>
      ) : null}
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[var(--color-accent)]"
      />
    </div>
  )
}
