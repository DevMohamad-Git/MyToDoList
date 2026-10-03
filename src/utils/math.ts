export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Clamp to 0–100 and round; every progress value in the app passes through here. */
export function toPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(clamp(value, 0, 100))
}

/** Safe ratio that returns `fallback` instead of `NaN`/`Infinity` for a zero denominator. */
export function ratio(numerator: number, denominator: number, fallback = 0): number {
  if (!denominator || !Number.isFinite(denominator)) return fallback
  const r = numerator / denominator
  return Number.isFinite(r) ? r : fallback
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

export function average(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length
}

export function round(value: number, decimals = 0): number {
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

export function groupBy<T, K extends string | number>(
  items: T[],
  key: (item: T) => K,
): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}

export function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

export function byOrderThenCreated<T extends { order: number; createdAt: string }>(
  a: T,
  b: T,
): number {
  if (a.order !== b.order) return a.order - b.order
  return a.createdAt.localeCompare(b.createdAt)
}
