import type { BanXiaMood } from './speech-segment.parser'

export interface GptSovitsConfig {
  enabled: boolean
  apiEndpoint: string // 默认 'http://127.0.0.1:9880'
  inferenceDir: string // 本地推理文件夹绝对路径
  gptWeightsPath: string // .ckpt 文件绝对路径
  sovitsWeightsPath: string // .pth 文件绝对路径
  defaultPromptLang: 'ja' | 'zh'
  defaultTextLang: 'zh' | 'ja'
  speedFactor: number // 默认 1.0
  textSplitMethod: string // 默认 'cut5'
}

export interface VoiceMoodEntry {
  audioPath: string
  promptText: string
  promptLang: string
}

export type VoiceMoodMap = Record<BanXiaMood, VoiceMoodEntry>

export interface ScannedAudioFile {
  path: string
  name: string
  detectedMood?: BanXiaMood
  promptText?: string
  promptLang?: string
}

export interface InferenceDirScanResult {
  inferenceDir: string
  gptWeights: string[] // 找到的所有 .ckpt 权重
  sovitsWeights: string[] // 找到的所有 .pth 权重
  moodMap: Partial<VoiceMoodMap> // 自动识别的情绪映射表
  audioFiles: ScannedAudioFile[] // 扫描到的参考音频列表
  voiceMoodMapJsonPath?: string // 是否发现 voice_mood_map.json
}

export interface SynthesizeOptions {
  text: string
  textLang?: 'zh' | 'ja'
  mood?: BanXiaMood
  refAudioPath?: string
  promptText?: string
  promptLang?: string
  speedFactor?: number
}

export interface SynthesizeResult {
  success: boolean
  audioBuffer?: Uint8Array
  audioUrl?: string
  offline?: boolean
  error?: string
}
