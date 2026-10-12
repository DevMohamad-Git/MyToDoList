import { AlertTriangle, Check, Info, X } from 'lucide-react'
import { create } from 'zustand'
import { createPortal } from 'react-dom'
import { newId } from '@/utils/id'
import { cn } from '@/utils/cn'

/**
 * Toast notifications.
 *
 * A plain store rather than a context provider so non-React code — repository
 * callers, import/export routines — can report success or failure without a hook.
 */

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: string
  tone: ToastTone
  message: string
  /** Milliseconds before auto-dismissal; `0` keeps it until dismissed. */
  duration: number
  action?: ToastAction
}

interface ToastState {
  toasts: Toast[]
  push: (message: string, tone?: ToastTone, duration?: number, action?: ToastAction) => string
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push(message, tone = 'info', duration = tone === 'error' ? 6000 : 3800, action?: ToastAction) {
    const id = newId()
    set((s) => ({ toasts: [...s.toasts, { id, tone, message, duration, action }] }))
    if (duration > 0) {
      window.setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
      }, duration)
    }
    return id
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

export const toast = {
  success: (message: string, action?: ToastAction) =>
    useToastStore.getState().push(message, 'success', action ? 5000 : 3200, action),
  error: (message: string, action?: ToastAction) =>
    useToastStore.getState().push(message, 'error', 6000, action),
  info: (message: string, action?: ToastAction) =>
    useToastStore.getState().push(message, 'info', 3200, action),
}

const TONE: Record<ToastTone, { class: string; icon: typeof Check }> = {
  success: { class: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', icon: Check },
  error: { class: 'border-rose-500/30 bg-rose-500/10 text-rose-300', icon: AlertTriangle },
  info: { class: 'border-border bg-popover text-popover-foreground', icon: Info },
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed end-4 bottom-4 z-[60] flex w-80 flex-col gap-2"
    >
      {toasts.map((item) => {
        const tone = TONE[item.tone]
        const Icon = tone.icon
        return (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm shadow-lg backdrop-blur',
              tone.class,
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" />
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span className="min-w-0 break-words">{item.message}</span>
              {item.action ? (
                <button
                  type="button"
                  onClick={() => {
                    item.action?.onClick()
                    dismiss(item.id)
                  }}
                  className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold underline underline-offset-2 transition-opacity hover:opacity-80 cursor-pointer"
                >
                  {item.action.label}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(item.id)}
              className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>,
    document.body,
  )
}
