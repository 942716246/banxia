import { logger } from '@baishou/shared'
import type { IFileSystem } from '../fs/file-system.types'
import type { BanXiaMood } from './speech-segment.parser'
import type {
  GptSovitsConfig,
  InferenceDirScanResult,
  SynthesizeOptions,
  SynthesizeResult,
  VoiceMoodEntry,
  VoiceMoodMap
} from './gpt-sovits.types'
import { scanInferenceDirectory } from './inference-dir-scanner'

export const DEFAULT_GPT_SOVITS_CONFIG: GptSovitsConfig = {
  enabled: true,
  apiEndpoint: 'http://127.0.0.1:9880',
  inferenceDir: 'K:\\GPT-SoVITS',
  gptWeightsPath: '',
  sovitsWeightsPath: '',
  defaultPromptLang: 'ja',
  defaultTextLang: 'zh',
  speedFactor: 1.0,
  textSplitMethod: 'cut5'
}

/**
 * 本地 GPT-SoVITS-v2proplus 语音合成直连服务
 *
 * 1. 原生对接本地 http://127.0.0.1:9880
 * 2. 动态切换 .ckpt (GPT) 与 .pth (SoVITS) 模型权重
 * 3. 情绪参考音频自动选取与兜底
 * 4. 离线静默降级（服务未启动时不抛出未捕获异常）
 */
export class GptSovitsService {
  private config: GptSovitsConfig
  private moodMap: Partial<VoiceMoodMap> = {}
  private availableGptWeights: string[] = []
  private availableSovitsWeights: string[] = []
  private fileSystem: IFileSystem

  constructor(fileSystem: IFileSystem, initialConfig?: Partial<GptSovitsConfig>) {
    this.fileSystem = fileSystem
    this.config = { ...DEFAULT_GPT_SOVITS_CONFIG, ...initialConfig }
  }

  public getConfig(): GptSovitsConfig {
    return { ...this.config }
  }

  public updateConfig(patch: Partial<GptSovitsConfig>): void {
    this.config = { ...this.config, ...patch }
  }

  public getMoodMap(): Partial<VoiceMoodMap> {
    return { ...this.moodMap }
  }

  public setMoodEntry(mood: BanXiaMood, entry: VoiceMoodEntry): void {
    this.moodMap[mood] = entry
  }

  public setMoodMap(map: Partial<VoiceMoodMap>): void {
    this.moodMap = { ...this.moodMap, ...map }
  }

  public getAvailableWeights(): { gpt: string[]; sovits: string[] } {
    return {
      gpt: [...this.availableGptWeights],
      sovits: [...this.availableSovitsWeights]
    }
  }

  /**
   * 扫描用户指定的本地推理文件夹
   */
  public async scanInferenceDir(dirPath?: string): Promise<InferenceDirScanResult> {
    const targetDir = dirPath || this.config.inferenceDir
    if (!targetDir) {
      return {
        inferenceDir: '',
        gptWeights: [],
        sovitsWeights: [],
        moodMap: {},
        audioFiles: []
      }
    }

    const result = await scanInferenceDirectory(targetDir, this.fileSystem)
    this.availableGptWeights = result.gptWeights
    this.availableSovitsWeights = result.sovitsWeights
    this.moodMap = { ...this.moodMap, ...result.moodMap }
    this.config.inferenceDir = targetDir

    // 默认选用第一个权重
    if (!this.config.gptWeightsPath && result.gptWeights.length > 0 && result.gptWeights[0]) {
      this.config.gptWeightsPath = result.gptWeights[0]
    }
    if (!this.config.sovitsWeightsPath && result.sovitsWeights.length > 0 && result.sovitsWeights[0]) {
      this.config.sovitsWeightsPath = result.sovitsWeights[0]
    }

    return result
  }

  /**
   * 检查本地服务是否在线
   */
  public async checkHealth(): Promise<boolean> {
    try {
      const url = `${this.config.apiEndpoint.replace(/\/+$/, '')}/`
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2000)

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      return response.ok || response.status === 404 // 只要端口有 HTTP 响应即视为在线
    } catch {
      return false
    }
  }

  /**
   * 动态加载 GPT 模型权重 (.ckpt)
   */
  public async setGptWeights(weightsPath?: string): Promise<boolean> {
    const target = weightsPath || this.config.gptWeightsPath
    if (!target) return false

    try {
      const endpoint = this.config.apiEndpoint.replace(/\/+$/, '')
      const url = `${endpoint}/set_gpt_weights?weights_path=${encodeURIComponent(target)}`
      const response = await fetch(url)
      if (response.ok) {
        this.config.gptWeightsPath = target
        logger.info(`[GptSovitsService] GPT weights set successfully: ${target}`)
        return true
      }
      return false
    } catch (e: any) {
      logger.warn(`[GptSovitsService] set_gpt_weights 失败（可能服务未启动）:`, e)
      return false
    }
  }

  /**
   * 动态加载 SoVITS 模型权重 (.pth)
   */
  public async setSovitsWeights(weightsPath?: string): Promise<boolean> {
    const target = weightsPath || this.config.sovitsWeightsPath
    if (!target) return false

    try {
      const endpoint = this.config.apiEndpoint.replace(/\/+$/, '')
      const url = `${endpoint}/set_sovits_weights?weights_path=${encodeURIComponent(target)}`
      const response = await fetch(url)
      if (response.ok) {
        this.config.sovitsWeightsPath = target
        logger.info(`[GptSovitsService] SoVITS weights set successfully: ${target}`)
        return true
      }
      return false
    } catch (e: any) {
      logger.warn(`[GptSovitsService] set_sovits_weights 失败（可能服务未启动）:`, e)
      return false
    }
  }

  /**
   * 执行文本合成请求
   */
  public async synthesize(options: SynthesizeOptions): Promise<SynthesizeResult> {
    if (!this.config.enabled) {
      return { success: false, error: 'TTS is disabled in configuration' }
    }

    if (!options.text || !options.text.trim()) {
      return { success: false, error: 'Empty text to synthesize' }
    }

    const mood = options.mood || 'neutral'
    const moodRef = this.moodMap[mood] || this.moodMap.neutral

    const refAudioPath = options.refAudioPath || moodRef?.audioPath
    const promptText = options.promptText ?? moodRef?.promptText ?? ''
    const promptLang =
      options.promptLang || moodRef?.promptLang || this.config.defaultPromptLang || 'ja'
    const textLang = options.textLang || this.config.defaultTextLang || 'zh'
    const speedFactor = options.speedFactor || this.config.speedFactor || 1.0

    if (!refAudioPath) {
      return {
        success: false,
        error: `No reference audio available for mood: ${mood} (neutral fallback missing)`
      }
    }

    const endpoint = this.config.apiEndpoint.replace(/\/+$/, '')
    const query = new URLSearchParams({
      text: options.text.trim(),
      text_lang: textLang,
      ref_audio_path: refAudioPath,
      prompt_text: promptText,
      prompt_lang: promptLang,
      text_split_method: this.config.textSplitMethod || 'cut5',
      media_type: 'wav',
      batch_size: '1',
      parallel_infer: 'true',
      speed_factor: String(speedFactor)
    })

    const ttsUrl = `${endpoint}/tts?${query.toString()}`

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000)

      const response = await fetch(ttsUrl, {
        method: 'GET',
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText || response.statusText}`
        }
      }

      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = new Uint8Array(arrayBuffer)

      return {
        success: true,
        audioBuffer,
        audioUrl: ttsUrl
      }
    } catch (e: any) {
      const isConnectionError =
        e.code === 'ECONNREFUSED' ||
        e.message?.includes('fetch failed') ||
        e.message?.includes('Failed to fetch') ||
        e.name === 'AbortError'

      if (isConnectionError) {
        logger.warn('[GptSovitsService] GPT-SoVITS 本地服务未运行，静默降级为文本气泡')
        return {
          success: false,
          offline: true,
          error: 'Local GPT-SoVITS server is offline (connection refused)'
        }
      }

      return {
        success: false,
        error: e.message || String(e)
      }
    }
  }
}
