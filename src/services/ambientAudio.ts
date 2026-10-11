/**
 * Ambient Audio Synthesis Service for Deep Work & Focus.
 *
 * Uses the Web Audio API to generate zero-asset, 100% offline, continuous
 * ambient soundscapes designed to isolate the user from auditory distractions:
 *  - White Noise: crisp background masking
 *  - Pink Noise / Rain: balanced, natural relaxing frequency
 *  - Brown Noise: deep, warm rumble (waterfall/deep waves - optimal for ADHD focus)
 *  - Binaural 40Hz: scientific Gamma wave frequency for cognitive attention
 */

export type AmbientSoundType = 'none' | 'white' | 'pink' | 'brown' | 'binaural'

class AmbientAudioManager {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private activeSource: AudioBufferSourceNode | OscillatorNode | null = null
  private rightOsc: OscillatorNode | null = null
  private currentType: AmbientSoundType = 'none'
  private currentVolume = 0.35
  private isPlaying = false

  private initContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new AudioCtx()
      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.setValueAtTime(this.currentVolume, this.ctx.currentTime)
      this.masterGain.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
    return this.ctx
  }

  public getSound(): AmbientSoundType {
    return this.currentType
  }

  public getVolume(): number {
    return this.currentVolume
  }

  public setVolume(volume: number) {
    this.currentVolume = Math.max(0, Math.min(1, volume))
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.currentVolume, this.ctx.currentTime, 0.05)
    }
  }

  public async setSound(type: AmbientSoundType, autoPlay = true) {
    this.currentType = type
    if (type === 'none') {
      this.stop()
      return
    }
    if (autoPlay) {
      await this.play()
    }
  }

  public async play() {
    if (this.currentType === 'none') return
    const ctx = this.initContext()

    this.stopSources()

    if (this.currentType === 'binaural') {
      this.startBinaural(ctx)
    } else {
      this.startNoise(ctx, this.currentType)
    }

    this.isPlaying = true
  }

  public stop() {
    this.stopSources()
    this.isPlaying = false
  }

  private stopSources() {
    if (this.activeSource) {
      try {
        this.activeSource.stop()
        this.activeSource.disconnect()
      } catch {
        // already stopped
      }
      this.activeSource = null
    }
    if (this.rightOsc) {
      try {
        this.rightOsc.stop()
        this.rightOsc.disconnect()
      } catch {
        // already stopped
      }
      this.rightOsc = null
    }
  }

  private startNoise(ctx: AudioContext, type: 'white' | 'pink' | 'brown') {
    const sampleRate = ctx.sampleRate
    const duration = 5 // 5 second seamless loop
    const bufferSize = sampleRate * duration
    const buffer = ctx.createBuffer(2, bufferSize, sampleRate)

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel)
      if (type === 'white') {
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.3
        }
      } else if (type === 'pink') {
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1
          b0 = 0.99886 * b0 + white * 0.0555179
          b1 = 0.99332 * b1 + white * 0.0750759
          b2 = 0.96900 * b2 + white * 0.1538520
          b3 = 0.86650 * b3 + white * 0.3104856
          b4 = 0.55000 * b4 + white * 0.5329522
          b5 = -0.7616 * b5 - white * 0.0168980
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08
          b6 = white * 0.115926
        }
      } else if (type === 'brown') {
        let lastOut = 0.0
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1
          lastOut = (lastOut + 0.02 * white) / 1.02
          data[i] = lastOut * 0.9
        }
      }
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true

    // Low-pass filter to smooth edge transitions and provide warm tones
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = type === 'brown' ? 600 : type === 'pink' ? 1800 : 8000

    source.connect(filter)
    if (this.masterGain) {
      filter.connect(this.masterGain)
    }

    source.start(0)
    this.activeSource = source
  }

  private startBinaural(ctx: AudioContext) {
    // 200Hz base carrier in Left channel, 240Hz in Right channel (40Hz Gamma wave)
    const merger = ctx.createChannelMerger(2)

    const oscLeft = ctx.createOscillator()
    oscLeft.type = 'sine'
    oscLeft.frequency.value = 200

    const oscRight = ctx.createOscillator()
    oscRight.type = 'sine'
    oscRight.frequency.value = 240

    const leftGain = ctx.createGain()
    leftGain.gain.value = 0.2
    const rightGain = ctx.createGain()
    rightGain.gain.value = 0.2

    oscLeft.connect(leftGain)
    leftGain.connect(merger, 0, 0) // Left channel

    oscRight.connect(rightGain)
    rightGain.connect(merger, 0, 1) // Right channel

    if (this.masterGain) {
      merger.connect(this.masterGain)
    }

    oscLeft.start(0)
    oscRight.start(0)

    this.activeSource = oscLeft
    this.rightOsc = oscRight
  }

  public getIsPlaying(): boolean {
    return this.isPlaying
  }
}

export const ambientAudio = new AmbientAudioManager()
