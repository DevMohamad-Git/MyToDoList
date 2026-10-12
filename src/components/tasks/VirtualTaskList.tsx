import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface VirtualTaskListProps<T> {
  items: T[]
  estimatedItemHeight?: number
  overscan?: number
  renderItem: (item: T, index: number) => ReactNode
  className?: string
  enabled?: boolean
}

/**
 * Lightweight, zero-dependency virtual list container.
 * When enabled (and items.length >= 30), it renders only the visible slice
 * to guarantee 60 FPS even with thousands of tasks.
 */
export function VirtualTaskList<T>({
  items,
  estimatedItemHeight = 56,
  overscan = 5,
  renderItem,
  className,
  enabled = true,
}: VirtualTaskListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleScroll = () => {
      setScrollTop(el.scrollTop)
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height || 600)
      }
    })

    el.addEventListener('scroll', handleScroll, { passive: true })
    resizeObserver.observe(el)

    return () => {
      el.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
    }
  }, [])

  // If disabled or list is small, render directly for minimum overhead
  if (!enabled || items.length < 30) {
    return <div className={className}>{items.map((item, index) => renderItem(item, index))}</div>
  }

  const totalCount = items.length
  const totalHeight = totalCount * estimatedItemHeight

  const startIndex = Math.max(0, Math.floor(scrollTop / estimatedItemHeight) - overscan)
  const endIndex = Math.min(
    totalCount,
    Math.ceil((scrollTop + viewportHeight) / estimatedItemHeight) + overscan,
  )

  const visibleItems = items.slice(startIndex, endIndex)
  const offsetY = startIndex * estimatedItemHeight

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ maxHeight: '72vh', overflowY: 'auto', position: 'relative' }}
    >
      <div style={{ height: `${totalHeight}px`, position: 'relative', width: '100%' }}>
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {visibleItems.map((item, i) => renderItem(item, startIndex + i))}
        </div>
      </div>
    </div>
  )
}
