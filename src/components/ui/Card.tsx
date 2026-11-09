import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/utils/cn'

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('rounded-card border border-border bg-card text-card-foreground', className)}
        {...props}
      />
    )
  },
)
Card.displayName = 'Card'

export function CardHeader({
  title,
  description,
  actions,
  icon,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-border p-4', className)}>
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        {icon ? <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  )
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />
}

/** Headline number with a label — the dashboard/analytics stat tile. */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  className,
  onClick,
  active = false,
  title,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'positive' | 'warning' | 'danger' | 'accent'
  className?: string
  onClick?: () => void
  active?: boolean
  title?: string
}) {
  const toneClass = {
    default: 'text-foreground',
    positive: 'text-emerald-400',
    warning: 'text-amber-400',
    danger: 'text-rose-400',
    accent: 'text-accent',
  }[tone]

  return (
    <Card
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={title}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={cn(
        'min-w-0 overflow-hidden p-4 flex flex-col justify-between h-full transition-all duration-150',
        onClick &&
          'cursor-pointer select-none hover:border-accent/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.99]',
        active && 'ring-2 ring-accent border-accent bg-accent/5 shadow-sm',
        className,
      )}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 text-xs font-medium leading-snug text-muted-foreground">
            {label}
          </span>
          {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
        </div>
        <div className={cn('mt-2 break-words text-xl font-semibold leading-tight sm:text-2xl', toneClass)}>
          {value}
        </div>
      </div>
      {hint ? <div className="mt-2 text-xs leading-snug text-muted-foreground">{hint}</div> : null}
    </Card>
  )
}

/** Page-level heading with optional actions; used at the top of every route. */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn('h-px w-full bg-border', className)} />
}
