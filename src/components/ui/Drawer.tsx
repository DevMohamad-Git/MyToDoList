import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { useT } from '@/i18n'
import { cn } from '@/utils/cn'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  side?: 'left' | 'right'
  size?: string
  className?: string
}

/**
 * Slide-out drawer rendered into a portal.
 * Ideal for deep inspection and editing while maintaining user context.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = 'left',
  className,
}: DrawerProps) {
  const t = useT()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Focus first input or button
    const target = panelRef.current?.querySelector<HTMLElement>(
      'input:not([type=hidden]), textarea, select, button',
    )
    target?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'fixed inset-y-0 z-50 flex w-full flex-col bg-card shadow-2xl duration-250 sm:max-w-xl md:max-w-2xl',
          side === 'left'
            ? 'left-0 border-e border-border animate-in slide-in-from-left'
            : 'right-0 border-s border-border animate-in slide-in-from-right',
          className,
        )}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5 shrink-0 bg-card">
          <div className="min-w-0 flex-1">
            {typeof title === 'string' ? (
              <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
            ) : (
              title
            )}
            {description ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('cClose')}
            onClick={onClose}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {/* Drawer Footer */}
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-border bg-card px-5 py-3.5 shrink-0">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
