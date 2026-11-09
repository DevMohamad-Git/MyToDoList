import { toast } from '@/components/ui'

/**
 * Robust notification service supporting Web Notifications API, Service Worker showNotification,
 * Web Audio chimes, and an unthrottled Web Worker ticker for background tabs (e.g. while watching YouTube).
 */

export function getNotificationPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }
  return Notification.permission
}

/**
 * Requests permission to show desktop notifications.
 * MUST be invoked directly from a user gesture (e.g. a button click) to prevent browser blocking.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }
  try {
    const res = await Notification.requestPermission()
    return res
  } catch (err) {
    console.error('Failed to request notification permission:', err)
    return Notification.permission
  }
}

/**
 * Sends a native desktop notification that appears as an OS popup outside the browser.
 * Uses `requireInteraction: true` to prevent Windows from auto-dismissing before the user sees it.
 */
export async function sendDesktopNotification(options: {
  title: string
  body: string
  tag?: string
  onClick?: () => void
}): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission !== 'granted') return false

  const notificationOptions: NotificationOptions = {
    body: options.body,
    icon: '/icon-192.png',
    badge: '/favicon.svg',
    requireInteraction: true,
    tag: options.tag ?? 'flow-task-reminder',
    silent: false,
  }

  // 1. Try Service Worker first if an active registration exists
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg && reg.active && typeof reg.showNotification === 'function') {
        await reg.showNotification(options.title, notificationOptions)
        return true
      }
    } catch {
      // Fall through to window.Notification
    }
  }

  // 2. Direct Notification API fallback
  try {
    const notif = new Notification(options.title, notificationOptions)
    notif.onclick = () => {
      options.onClick?.()
      window.focus()
    }
    return true
  } catch (err) {
    console.error('Failed to show notification:', err)
    return false
  }
}

let audioCtxInstance: AudioContext | null = null

/**
 * Plays a pleasant synthesized notification chime using Web Audio API without any external assets.
 */
export function playNotificationChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return

    if (!audioCtxInstance || audioCtxInstance.state === 'closed') {
      audioCtxInstance = new AudioCtx()
    }
    const ctx = audioCtxInstance
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12) // A5
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2)

    osc.start()
    osc.stop(ctx.currentTime + 1.2)
  } catch {
    // Audio is a nicety; never break if blocked
  }
}

/**
 * Creates an unthrottled ticker using a lightweight Web Worker.
 * Web Workers run in a separate thread and are not subjected to the severe 1-minute
 * background tab throttling that browsers impose on window.setInterval when inactive.
 */
export function createWorkerTicker(onTick: () => void, intervalMs = 15000): () => void {
  try {
    const blob = new Blob(
      [
        `let timer = null;
         self.onmessage = function(e) {
           if (e.data === 'start') {
             if (!timer) timer = setInterval(() => self.postMessage('tick'), ${intervalMs});
           } else if (e.data === 'stop') {
             if (timer) { clearInterval(timer); timer = null; }
           }
         };`,
      ],
      { type: 'application/javascript' },
    )
    const workerUrl = URL.createObjectURL(blob)
    const worker = new Worker(workerUrl)
    worker.onmessage = () => {
      onTick()
    }
    worker.postMessage('start')
    return () => {
      worker.postMessage('stop')
      worker.terminate()
      URL.revokeObjectURL(workerUrl)
    }
  } catch {
    // Fallback if Web Workers are restricted in this environment
    const id = setInterval(onTick, intervalMs)
    return () => clearInterval(id)
  }
}

/**
 * Immediately triggers a test notification to prove to the user that popups work outside the browser.
 */
export async function testDesktopNotification(
  title: string,
  body: string,
  successMsg: string,
  blockedMsg: string,
): Promise<boolean> {
  const perm = await requestNotificationPermission()
  if (perm !== 'granted') {
    toast.error(blockedMsg)
    return false
  }

  playNotificationChime()
  await sendDesktopNotification({
    title,
    body,
    tag: 'flow-test-notification',
  })
  toast.success(successMsg)
  return true
}
