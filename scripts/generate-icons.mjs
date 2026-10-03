/**
 * Generates the PWA icon set (public/favicon.svg, icon-192.png, icon-512.png).
 *
 * Run with: node scripts/generate-icons.mjs
 *
 * The PNG encoder is deliberately dependency-free (zlib from the Node standard
 * library) so the whole icon pipeline stays reproducible without adding a
 * package. The mark is a rounded dark tile with an accent "M" drawn by
 * measuring pixel distance to four line segments.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')
mkdirSync(publicDir, { recursive: true })

// Brand palette — mirrors the manifest theme_color.
const BG = [11, 13, 16] // #0b0d10
const ACCENT = [56, 189, 248] // sky-400
const INK = [235, 240, 246]

const size = 512
const radius = size * 0.2
const stroke = size * 0.085

/** Squared distance from point p to segment a-b. */
function segDist2(px, py, ax, ay, bx, by) {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby)))
  const dx = apx - abx * t
  const dy = apy - aby * t
  return dx * dx + dy * dy
}

/** Rounded-rectangle signed distance (negative inside). */
function roundRectSDF(px, py, half, r) {
  const qx = Math.abs(px) - half + r
  const qy = Math.abs(py) - half + r
  return (
    Math.min(Math.max(qx, qy), 0) +
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) -
    r
  )
}

/**
 * The "M": two vertical stems joined by a V in the middle.
 * Coordinates are in a 512-unit space, centered at 0.
 */
const M = (() => {
  const s = size
  const h = s * 0.27 // half width
  const top = -s * 0.17
  const bottom = s * 0.17
  const mid = -s * 0.02
  return [
    [-h, top, -h, bottom],
    [-h, top + stroke * 0.2, 0, mid],
    [0, mid, h, top + stroke * 0.2],
    [h, top, h, bottom],
  ]
})()

/** Anti-aliased coverage of the "M" at a pixel. */
function glyphCoverage(cx, cy) {
  let d = Infinity
  for (const [ax, ay, bx, by] of M) d = Math.min(d, segDist2(cx, cy, ax, ay, bx, by))
  const dist = Math.sqrt(d) - stroke / 2
  return Math.max(0, Math.min(1, 0.5 - dist)) // ~1px AA ramp
}

/** Coverage of the rounded tile at a pixel. */
function tileCoverage(px, py) {
  const d = roundRectSDF(px - size / 2, py - size / 2, size / 2, radius)
  return Math.max(0, Math.min(1, 0.5 - d))
}

function render(width) {
  const scale = width / size
  const rows = []
  for (let y = 0; y < width; y++) {
    const row = Buffer.alloc(width * 4)
    for (let x = 0; x < width; x++) {
      // Sample at pixel center in the 512 space.
      const px = (x + 0.5) / scale
      const py = (y + 0.5) / scale
      const tile = tileCoverage(px, py)
      const glyph = glyphCoverage(px, py)

      // Compose: transparent → bg tile → glyph highlight.
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      if (tile > 0) {
        r = BG[0]
        g = BG[1]
        b = BG[2]
        a = tile
        // Subtle vertical gradient on the tile.
        const shade = 1 - (py / size) * 0.25
        r *= shade
        g *= shade
        b *= shade
        if (glyph > 0) {
          r = r * (1 - glyph) + ACCENT[0] * glyph
          g = g * (1 - glyph) + ACCENT[1] * glyph
          b = b * (1 - glyph) + ACCENT[2] * glyph
        }
      }
      const i = (x + y * width) * 4
      row[i] = Math.round(r)
      row[i + 1] = Math.round(g)
      row[i + 2] = Math.round(b)
      row[i + 3] = Math.round(a * 255)
    }
    rows.push(row)
  }
  return Buffer.concat(rows)
}

/** Minimal PNG writer: 8-bit RGBA, no interlace. */
function encodePng(width, height, raw) {
  const chunks = []
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crcTable = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
    const crc = Buffer.alloc(4)
    let c = 0xffffffff
    for (const byte of body) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0)
    return Buffer.concat([len, body, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  chunks.push(chunk('IHDR', ihdr))

  // Filter type 0 per scanline.
  const stride = width * 4
  const filtered = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    filtered[y * (stride + 1)] = 0
    raw.copy(filtered, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  chunks.push(chunk('IDAT', deflateSync(filtered, { level: 9 })))
  chunks.push(chunk('IEND', Buffer.alloc(0)))
  // The 8-byte PNG signature must precede every other chunk.
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks])
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#10141b"/>
      <stop offset="1" stop-color="#0b0d10"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="102" fill="url(#bg)"/>
  <g stroke="${`#${ACCENT.map((v) => v.toString(16).padStart(2, '0')).join('')}`}" stroke-width="44" stroke-linecap="round" fill="none">
    <path d="M 120 148 L 120 364"/>
    <path d="M 120 158 L 256 295 L 392 158"/>
    <path d="M 392 148 L 392 364"/>
  </g>
</svg>
`

writeFileSync(join(publicDir, 'favicon.svg'), svg)
writeFileSync(join(publicDir, 'icon-512.png'), encodePng(512, 512, render(512)))
writeFileSync(join(publicDir, 'icon-192.png'), encodePng(192, 192, render(192)))
console.log('Wrote public/favicon.svg, public/icon-192.png, public/icon-512.png')
