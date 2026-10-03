import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/utils/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'subtle'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-foreground hover:brightness-110 shadow-sm',
  secondary: 'bg-muted text-foreground hover:bg-muted/70 border border-border',
  outline: 'border border-border bg-transparent hover:bg-muted/60',
  ghost: 'bg-transparent hover:bg-muted/60',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 shadow-sm',
  subtle: 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
  icon: 'h-9 w-9 justify-center',
  'icon-sm': 'h-7 w-7 justify-center',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center rounded-lg font-medium transition-colors select-none',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  )
}

/** Segmented control used for view switchers (month/week/day, ranges, …). */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
  size = 'sm',
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (value: T) => void
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div className={cn('inline-flex rounded-lg border border-border bg-muted/40 p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md font-medium transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            value === option.value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Small icon-only action that only reveals itself on row hover. */
export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonProps & { label: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      className={cn('text-muted-foreground hover:text-foreground', className)}
      {...props}
    >
      {children}
    </Button>
  )
}
