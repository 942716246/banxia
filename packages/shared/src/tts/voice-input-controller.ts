import { logger } from '../utils/logger'

export type VoiceInputState = 'idle' | 'recording' | 'transcribing' | 'locked'

export interface VoiceInputControllerOptions {
  /** 语音识别语言，默认 'zh-CN' */
  lang?: string
  /** 状态变更回调 */
  onStateChange?: (state: VoiceInputState) => void
  /** 实时/最终文字转录结果回调 */
  onTranscript?: (transcript: string, isFinal: boolean) => void
  /** 错误回调 */
  onError?: (error: any) => void
  /** 抢断/打断回调（当半夏正在说话时触发录音，先打断 TTS 播放） */
  onBargeIn?: () => void
}

/**
 * 语音对讲与硬核防回声互斥锁控制器 (Push-to-Talk & Anti-Echo Mutex Lock)
 *
 * 1. 硬核防回声互斥锁：
 *    当半夏正在说话播放音频时（AudioTachieQueue.isSpeaking === true），锁定麦克风，防止麦克风收音形成自激与回声循环。
 * 2. 抢断与瞬间打断（Barge-in）：
 *    若用户主动按下对讲键强制插话（forceBargeIn），立刻触发 onBargeIn() 强行掐断 TTS 播放并释放麦克风锁开始录音。
 * 3. 语音识别（ASR）接入：
 *    封装原生 Web Speech API (SpeechRecognition / webkitSpeechRecognition)，流式收集文本结果。
 */
export class VoiceInputController {
  private state: VoiceInputState = 'idle'
  private isSpeakingLock = false
  private recognitionInstance: any = null
  private options: VoiceInputControllerOptions

  constructor(options?: VoiceInputControllerOptions) {
    this.options = options || {}
  }

  public setOptions(options: Partial<VoiceInputControllerOptions>): void {
    this.options = { ...this.options, ...options }
  }

  public getState(): VoiceInputState {
    return this.state
  }

  public isLocked(): boolean {
    return this.isSpeakingLock || this.state === 'locked'
  }

  /**
   * 同步半夏音频队列的播放状态（硬核防回声互斥锁）
   */
  public setSpeakingLock(isSpeaking: boolean): void {
    this.isSpeakingLock = isSpeaking
    if (isSpeaking) {
      if (this.state === 'idle') {
        this.setState('locked')
      }
    } else {
      if (this.state === 'locked') {
        this.setState('idle')
      }
    }
  }

  /**
   * 开始录音 / 对讲
   * @param forceBargeIn 是否强制抢断（打断半夏当前的说话）
   */
  public startRecording(options?: { forceBargeIn?: boolean }): boolean {
    const forceBargeIn = options?.forceBargeIn ?? false

    // 1. 若处于说话互斥锁定状态
    if (this.isSpeakingLock || this.state === 'locked') {
      if (forceBargeIn) {
        logger.info('[VoiceInputController] 用户触发强行抢断 (Barge-in)，中断半夏语音')
        this.isSpeakingLock = false
        this.options.onBargeIn?.()
      } else {
        const err = new Error('防回声互斥锁激活中：半夏正在说话，已阻止麦克风采集')
        logger.warn('[VoiceInputController]', err.message)
        this.options.onError?.(err)
        return false
      }
    }

    // 2. 若已经在录音中，避免重复触发
    if (this.state === 'recording') {
      return true
    }

    // 3. 尝试启动 Web Speech API
    try {
      const SpeechRecognition =
        typeof window !== 'undefined'
          ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
          : null

      if (SpeechRecognition) {
        this.recognitionInstance = new SpeechRecognition()
        this.recognitionInstance.lang = this.options.lang || 'zh-CN'
        this.recognitionInstance.continuous = true
        this.recognitionInstance.interimResults = true

        this.recognitionInstance.onresult = (event: any) => {
          let interimTranscript = ''
          let finalTranscript = ''
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              finalTranscript += transcript
            } else {
              interimTranscript += transcript
            }
          }
          const text = finalTranscript || interimTranscript
          if (text) {
            this.options.onTranscript?.(text, Boolean(finalTranscript))
          }
        }

        this.recognitionInstance.onerror = (event: any) => {
          logger.warn('[VoiceInputController] ASR 识别异常:', event.error)
          this.options.onError?.(event)
        }

        this.recognitionInstance.onend = () => {
          if (this.state === 'recording') {
            this.setState(this.isSpeakingLock ? 'locked' : 'idle')
          }
        }

        this.recognitionInstance.start()
      }
    } catch (e: any) {
      logger.warn('[VoiceInputController] 启动 SpeechRecognition 失败:', e)
    }

    this.setState('recording')
    return true
  }

  /**
   * 停止录音并触发转录就绪
   */
  public stopRecording(): void {
    if (this.state !== 'recording') return

    this.setState('transcribing')

    if (this.recognitionInstance) {
      try {
        this.recognitionInstance.stop()
      } catch {
        // ignore
      }
      this.recognitionInstance = null
    }

    this.setState(this.isSpeakingLock ? 'locked' : 'idle')
  }

  /**
   * 强制中止并重置录音状态
   */
  public abort(): void {
    if (this.recognitionInstance) {
      try {
        this.recognitionInstance.abort()
      } catch {
        // ignore
      }
      this.recognitionInstance = null
    }
    this.setState(this.isSpeakingLock ? 'locked' : 'idle')
  }

  private setState(newState: VoiceInputState): void {
    if (this.state !== newState) {
      this.state = newState
      this.options.onStateChange?.(newState)
    }
  }
}
