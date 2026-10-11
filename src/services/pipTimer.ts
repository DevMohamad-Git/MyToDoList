/**
 * Picture-in-Picture (PiP) Floating Timer Renderer.
 *
 * Uses an HTML5 Canvas capture stream piped into a video element to allow
 * a floating Always-On-Top mini timer window over VS Code, desktop, or other apps.
 */

class PipTimerManager {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private video: HTMLVideoElement | null = null
  private onStateChange: ((active: boolean) => void) | null = null

  private init() {
    if (this.canvas) return

    this.canvas = document.createElement('canvas')
    this.canvas.width = 360
    this.canvas.height = 200
    this.ctx = this.canvas.getContext('2d')

    this.video = document.createElement('video')
    this.video.muted = true
    this.video.playsInline = true

    // Capture canvas stream at 10 fps
    const stream = this.canvas.captureStream(10)
    this.video.srcObject = stream

    this.video.addEventListener('leavepictureinpicture', () => {
      if (this.onStateChange) this.onStateChange(false)
    })
  }

  public setOnStateChange(cb: (active: boolean) => void) {
    this.onStateChange = cb
  }

  public isSupported(): boolean {
    return typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled
  }

  public isActive(): boolean {
    return Boolean(
      document.pictureInPictureElement &&
        this.video &&
        document.pictureInPictureElement === this.video,
    )
  }

  public async toggle(
    timeStr: string,
    taskTitle: string,
    modeLabel: string,
    isBreak: boolean,
    running: boolean,
  ): Promise<boolean> {
    if (this.isActive()) {
      await document.exitPictureInPicture()
      return false
    } else {
      this.init()
      this.render(timeStr, taskTitle, modeLabel, isBreak, running)
      if (this.video) {
        await this.video.play()
        await this.video.requestPictureInPicture()
        return true
      }
      return false
    }
  }

  public render(
    timeStr: string,
    taskTitle: string,
    modeLabel: string,
    isBreak: boolean,
    running: boolean,
  ) {
    if (!this.canvas || !this.ctx) return

    const { width, height } = this.canvas
    const ctx = this.ctx

    // Sleek dark gradient background
    const bg = ctx.createLinearGradient(0, 0, width, height)
    bg.addColorStop(0, '#090d16')
    bg.addColorStop(1, '#0f172a')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)

    // Ambient glow in corner
    const glow = ctx.createRadialGradient(
      width / 2,
      height / 2,
      10,
      width / 2,
      height / 2,
      120,
    )
    glow.addColorStop(0, isBreak ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)')
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, width, height)

    // Status pill
    ctx.fillStyle = isBreak ? '#10b981' : '#38bdf8'
    ctx.font = '600 12px Vazirmatn, "Segoe UI", Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    const statusText = `${modeLabel} · ${running ? 'فعال' : 'متوقف'}`
    ctx.fillText(statusText, width / 2, 38)

    // Main Timer
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 52px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(timeStr, width / 2, 108)

    // Task Title
    ctx.fillStyle = '#94a3b8'
    ctx.font = '500 14px Vazirmatn, "Segoe UI", Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    const truncatedTask = taskTitle.length > 28 ? taskTitle.slice(0, 27) + '…' : taskTitle
    ctx.fillText(truncatedTask || 'جلسه تمرکز', width / 2, 148)

    // Bottom brand
    ctx.fillStyle = '#475569'
    ctx.font = '10px Vazirmatn, "Segoe UI", Inter, system-ui, sans-serif'
    ctx.fillText('FlowOS · Focus Engine', width / 2, 180)

    if (this.video && this.video.paused && this.isActive()) {
      void this.video.play().catch(() => {})
    }
  }
}

export const pipTimer = new PipTimerManager()
