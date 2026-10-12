import { useEffect, useState } from 'react'

/**
 * Debounce a rapidly changing value (e.g. search input).
 * Delays updating the debounced value until after `delay` milliseconds have elapsed
 * since the last time the input value changed.
 */
export function useDebounce<T>(value: T, delay = 250): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      window.clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}
