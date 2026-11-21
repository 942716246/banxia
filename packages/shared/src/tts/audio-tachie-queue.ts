import { logger } from '../utils/logger'
import type { SpeechSegment } from './speech-segment.parser'
import type { SynthesizeOptions, SynthesizeResult } from './gpt-sovits.types'

export interface AudioTachieQueueEvents {
  onSegmentStart?: (segment: SpeechSegment, audioBuffer?: Uint8Array, audioUrl?: string) => void
  onSegmentEnd?: (segment: SpeechSegment) => void
  onQueueComplete?: () => void
  onAbort?: () => void
  onError?: (error: any) => void
  onSpeakingStateChange?: (speaking: boolean) => void
}

export interface IAudioPlayer {
  play(audioBuffer: Uint8Array, audioUrl?: string): Promise<void>
  stop(): void
}

export interface ITtsSynthesizer {
  synthesize(options: SynthesizeOptions): Promise<SynthesizeResult>
}

/**
 * 默认离线模拟播放器（按文字长度推算拟真朗读时间）
 */
export class SimulatedAudioPlayer implements IAudioPlayer {
  private timer: any = null
  private resolveFn: (() => void) | null = null

  constructor(private readonly msPerChar = 160) {}

  public getMsPerChar(): number {
    return this.msPerChar
  }

  public async play(_audioBuffer: Uint8Array, _audioUrl?: string): Promise<void> {
    return new Promise((resolve) => {
      this.resolveFn = resolve
      this.timer = setTimeout(() => {
        this.timer = null
        this.resolveFn = null
        resolve()
      }, 500)
    })
  }

  public async playDuration(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      this.resolveFn = resolve
      this.timer = setTimeout(() => {
        this.timer = null
        this.resolveFn = null
        resolve()
      }, durationMs)
    })
  }

  public stop(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.resolveFn) {
      this.resolveFn()
      this.resolveFn = null
    }
  }
}

/**
 * 后台预合成 + 严格顺序播放队列
 *
 * 1. 严格串行播放：当且仅当前一句播放完毕，才推进到下一句
 * 2. 并行预取（Prefetch）：播放第 N 句时，后台提前发起第 N+1 句的音频合成
 * 3. 音画同步：句子音频起播时同步通知切换立绘表情与台词气泡
 * 4. 离线静默降级：GPT-SoVITS 离线时无缝切换为模拟打字耗时，不抛错
 * 5. 瞬间打断：abort() 立即中断音频播放与中止后台正在进行的请求
 */
export class AudioTachieQueue {
  private queue: SpeechSegment[] = []
  private prefetchCache = new Map<number, Promise<SynthesizeResult>>()
  private isRunning = false
  private isAborted = false
  private currentAbortController: AbortController | null = null
  private player: IAudioPlayer
  private events: AudioTachieQueueEvents

  constructor(
    private readonly ttsService: ITtsSynthesizer,
    player?: IAudioPlayer,
    events?: AudioTachieQueueEvents
  ) {
    this.player = player || new SimulatedAudioPlayer()
    this.events = events || {}
  }

  public setEvents(events: AudioTachieQueueEvents): void {
    this.events = { ...this.events, ...events }
  }

  public setPlayer(player: IAudioPlayer): void {
    this.player = player
  }

  public getIsRunning(): boolean {
    return this.isRunning
  }

  public isSpeaking(): boolean {
    return this.isRunning
  }

  /**
   * 追加一批切分好的短句并启动队列
   */
  public async enqueue(segments: SpeechSegment[]): Promise<void> {
    if (segments.length === 0) return
    this.isAborted = false
    this.queue.push(...segments)

    if (!this.isRunning) {
      this.runQueue().catch((e) => {
        logger.error('[AudioTachieQueue] 队列运行异常:', e)
        this.events.onError?.(e)
      })
    }
  }

  /**
   * 立即打断当前播放、终止后台所有预合成请求并清空队列
   */
  public abort(): void {
    this.isAborted = true
    this.queue = []
    this.prefetchCache.clear()

    if (this.currentAbortController) {
      this.currentAbortController.abort()
      this.currentAbortController = null
    }

    this.player.stop()
    const wasRunning = this.isRunning
    this.isRunning = false
    if (wasRunning) {
      this.events.onSpeakingStateChange?.(false)
    }
    this.events.onAbort?.()
    logger.info('[AudioTachieQueue] 播放队列已打断并清空')
  }

  private async runQueue(): Promise<void> {
    this.isRunning = true
    this.events.onSpeakingStateChange?.(true)

    let index = 0
    while (this.queue.length > 0 && !this.isAborted) {
      const segment = this.queue.shift()!
      const nextSegment = this.queue[0]

      // 1. 如果存在下一句且尚未预取，后台异步触发下一句合成（Prefetch）
      if (nextSegment && !this.prefetchCache.has(index + 1)) {
        const nextIdx = index + 1
        const prefetchPromise = this.ttsService.synthesize({
          text: nextSegment.text,
          mood: nextSegment.mood
        })
        this.prefetchCache.set(nextIdx, prefetchPromise)
      }

      // 2. 获取当前句子的合成结果（优先从预取缓存读取）
      let synthResult: SynthesizeResult
      if (this.prefetchCache.has(index)) {
        synthResult = await this.prefetchCache.get(index)!
        this.prefetchCache.delete(index)
      } else {
        synthResult = await this.ttsService.synthesize({
          text: segment.text,
          mood: segment.mood
        })
      }

      if (this.isAborted) break

      // 3. 触发当前句起播事件（通知切换立绘表情与弹出台词气泡）
      this.events.onSegmentStart?.(segment, synthResult.audioBuffer, synthResult.audioUrl)

      // 4. 播放音频或离线模拟延迟
      if (synthResult.success && synthResult.audioBuffer) {
        try {
          await this.player.play(synthResult.audioBuffer, synthResult.audioUrl)
        } catch (e: any) {
          logger.warn('[AudioTachieQueue] 音频播放失败，回退到拟真时长:', e)
          await this.simulateDuration(segment.text)
        }
      } else {
        // 离线静默降级或合成未提供音频
        await this.simulateDuration(segment.text)
      }

      if (this.isAborted) break

      // 5. 触发当前句播完事件
      this.events.onSegmentEnd?.(segment)
      index++
    }

    this.isRunning = false
    this.prefetchCache.clear()
    this.events.onSpeakingStateChange?.(false)
    if (!this.isAborted) {
      this.events.onQueueComplete?.()
    }
  }

  private async simulateDuration(text: string): Promise<void> {
    const durationMs = Math.max(1000, Math.min(8000, text.length * 150))
    if (this.player instanceof SimulatedAudioPlayer) {
      await this.player.playDuration(durationMs)
    } else {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, durationMs)
        if (this.isAborted) clearTimeout(timer)
      })
    }
  }
}
