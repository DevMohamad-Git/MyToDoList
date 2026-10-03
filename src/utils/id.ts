/**
 * Identifier generation.
 *
 * `crypto.randomUUID` needs a secure context; when the app is served over plain
 * HTTP on a LAN address it is absent, so fall back to `getRandomValues` and only
 * then to `Math.random`. Ids are opaque everywhere in the app, so the exact
 * shape does not matter — uniqueness and sort-stability do not depend on it.
 */
export function newId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
