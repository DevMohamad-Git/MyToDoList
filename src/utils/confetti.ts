/**
 * Lightweight, zero-dependency HTML5 Canvas Confetti animation.
 * Creates an ephemeral canvas overlay to celebrate streak milestones and daily completion.
 */

interface Particle {
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  rotation: number
  vr: number
  color: string
  opacity: number
  shape: 'rect' | 'circle'
}

const CONFETTI_COLORS = [
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#3b82f6', // blue
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#f97316', // orange
  '#eab308', // yellow
]

export function fireConfetti(count = 90): void {
  if (typeof document === 'undefined') return

  const canvas = document.createElement('canvas')
  canvas.style.position = 'fixed'
  canvas.style.top = '0'
  canvas.style.left = '0'
  canvas.style.width = '100vw'
  canvas.style.height = '100vh'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '99999'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return
  }

  const width = (canvas.width = window.innerWidth)
  const height = (canvas.height = window.innerHeight)

  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    // Launch from around horizontal center with outward spread
    const angle = Math.PI * (0.2 + Math.random() * 0.6)
    const speed = 7 + Math.random() * 11
    particles.push({
      x: width * (0.35 + Math.random() * 0.3),
      y: height * 0.75,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      vx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
      vy: -Math.sin(angle) * speed,
      rotation: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.2,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      opacity: 1,
      shape: Math.random() > 0.3 ? 'rect' : 'circle',
    })
  }

  const gravity = 0.35
  const drag = 0.985
  let animId = 0
  const startTime = Date.now()
  const duration = 2400

  function frame() {
    const elapsed = Date.now() - startTime
    if (elapsed > duration) {
      cancelAnimationFrame(animId)
      canvas.remove()
      return
    }

    ctx?.clearRect(0, 0, width, height)

    const fadeProgress = Math.max(0, (elapsed - 1500) / 900)

    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      p.vx *= drag
      p.vy = p.vy * drag + gravity
      p.rotation += p.vr
      p.opacity = Math.max(0, 1 - fadeProgress)

      if (ctx) {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color

        if (p.shape === 'rect') {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
    }

    animId = requestAnimationFrame(frame)
  }

  animId = requestAnimationFrame(frame)
}
