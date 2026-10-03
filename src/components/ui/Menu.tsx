import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/utils/cn'

export interface MenuItem {
  label: ReactNode
  onSelect: () => void
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  /** Renders a divider above this item. */
  separated?: boolean
}

/**
 * Lightweight dropdown menu. Closes on outside click, Escape, and after a
 * selection. Anchored to the trigger; flips to the left edge by default because
 * these live at the right end of rows and cards.
 */
export function Menu({
  trigger,
  items,
  align = 'right',
  className,
}: {
  trigger: ReactNode
  items: MenuItem[]
  align?: 'left' | 'right'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute z-40 mt-1 min-w-44 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-xl',
            align === 'right' ? 'end-0' : 'start-0',
          )}
        >
          {items.map((item, index) => (
            <div key={index}>
              {item.separated ? <div className="my-1 h-px bg-border" /> : null}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm transition-colors',
                  'disabled:pointer-events-none disabled:opacity-40',
                  item.danger
                    ? 'text-rose-400 hover:bg-rose-500/10'
                    : 'text-popover-foreground hover:bg-muted/70',
                )}
              >
                {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
                <span className="truncate">{item.label}</span>
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export interface TabDef<T extends string> {
  value: T
  label: ReactNode
  count?: number
}

/** Underlined tab bar. Horizontally scrollable so it survives narrow viewports. */
export function Tabs<T extends string>({
  value,
  tabs,
  onChange,
  className,
}: {
  value: T
  tabs: TabDef<T>[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cn('no-scrollbar flex gap-1 overflow-x-auto border-b border-border', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            value === tab.value
              ? 'border-accent text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
          {tab.count != null ? (
            <span className="rounded bg-muted px-1 text-[11px] tabular-nums text-muted-foreground">
              {tab.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}
