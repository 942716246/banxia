import { logger } from '../utils/logger'

export type VoiceInputState = 'idle' | 'recording' | 'transcribing' | 'locked'

export interface AsrConfig {
  apiUrl?: string // 例如本地或云端 OpenAI 兼容端点：http://127.0.0.1:9000/v1/audio/transcriptions
  apiKey?: string
  model?: string // 默认 whisper-1
}

export interface VoiceInputControllerOptions {
  /** 语音识别语言，默认 'zh-CN' */
  lang?: string
  /** ASR 语音转录后端配置（支持本地 Whisper/Faster-Whisper 等兼容服务） */
  asrConfig?: AsrConfig
  /** 状态变更回调 */
  onStateChange?: (state: VoiceInputState) => void
  /** 实时/最终文字转录结果回调 */
  onTranscript?: (transcript: string, isFinal: boolean) => void
  /** 录音完成后的音频 Blob 回调 */
  onAudioRecorded?: (audioBlob: any) => void
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
 *    同时支持现代浏览器 MediaRecorder（采集原始音频流上传本地 Whisper 端点）与 Web Speech API 识别兜底。
 */
export class VoiceInputController {
  private state: VoiceInputState = 'idle'
  private isSpeakingLock = false
  private recognitionInstance: any = null
  private mediaStream: any = null
  private mediaRecorder: any = null
  private recordedChunks: any[] = []
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

    this.recordedChunks = []

    // 3. 启动 MediaRecorder（优先用于 Electron/本地 Whisper ASR）
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          this.mediaStream = stream
          const RecorderClass = (window as any).MediaRecorder
          if (RecorderClass) {
            this.mediaRecorder = new RecorderClass(stream)
            this.mediaRecorder.ondataavailable = (e: any) => {
              if (e.data && e.data.size > 0) {
                this.recordedChunks.push(e.data)
              }
            }
            this.mediaRecorder.start()
          }
        })
        .catch((err) => {
          logger.warn('[VoiceInputController] 获取麦克风权限失败:', err)
          this.options.onError?.(err)
        })
    }

    // 4. 尝试启动 Web Speech API（若可用且未配置独立 ASR 端点）
    try {
      const SpeechRecognition =
        typeof window !== 'undefined'
          ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
          : null

      if (SpeechRecognition && !this.options.asrConfig?.apiUrl) {
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

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.onstop = async () => {
          const blob = new Blob(this.recordedChunks, { type: 'audio/webm' })
          this.options.onAudioRecorded?.(blob)

          if (this.options.asrConfig?.apiUrl) {
            await this.uploadAudioForTranscription(blob)
          }

          this.cleanupMediaStream()
          this.setState(this.isSpeakingLock ? 'locked' : 'idle')
        }
        this.mediaRecorder.stop()
      } catch {
        this.cleanupMediaStream()
        this.setState(this.isSpeakingLock ? 'locked' : 'idle')
      }
    } else {
      this.cleanupMediaStream()
      this.setState(this.isSpeakingLock ? 'locked' : 'idle')
    }
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

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop()
      } catch {
        // ignore
      }
    }

    this.cleanupMediaStream()
    this.setState(this.isSpeakingLock ? 'locked' : 'idle')
  }

  private cleanupMediaStream(): void {
    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track: any) => track.stop())
      } catch {
        // ignore
      }
      this.mediaStream = null
    }
    this.mediaRecorder = null
    this.recordedChunks = []
  }

  private async uploadAudioForTranscription(blob: Blob): Promise<void> {
    const config = this.options.asrConfig
    if (!config?.apiUrl) return

    try {
      const formData = new FormData()
      formData.append('file', blob, 'recording.webm')
      formData.append('model', config.model || 'whisper-1')
      const lang = this.options.lang ? this.options.lang.split('-')[0]! : 'zh'
      formData.append('language', lang)

      const headers: Record<string, string> = {}
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`
      }

      const res = await fetch(config.apiUrl, {
        method: 'POST',
        headers,
        body: formData
      })

      if (res.ok) {
        const data = await res.json()
        const text = (data.text || '').trim()
        if (text) {
          this.options.onTranscript?.(text, true)
        }
      } else {
        const errText = await res.text()
        logger.warn(`[VoiceInputController] ASR 转录失败: ${res.status} ${errText}`)
        this.options.onError?.(new Error(`ASR HTTP ${res.status}: ${errText}`))
      }
    } catch (e: any) {
      logger.warn('[VoiceInputController] 请求 ASR API 异常:', e)
      this.options.onError?.(e)
    }
  }

  private setState(newState: VoiceInputState): void {
    if (this.state !== newState) {
      this.state = newState
      this.options.onStateChange?.(newState)
    }
  }
}
