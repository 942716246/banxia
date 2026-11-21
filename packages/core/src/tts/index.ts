export {
  type BanXiaMood,
  type BanXiaTachie,
  type SpeechSegment,
  stripSpeechTags,
  extractMoodAndTachie,
  parseSpeechSegments,
  type GptSovitsConfig,
  type VoiceMoodEntry,
  type VoiceMoodMap,
  type ScannedAudioFile,
  type InferenceDirScanResult,
  type SynthesizeOptions,
  type SynthesizeResult,
  type AudioTachieQueueEvents,
  type IAudioPlayer,
  type ITtsSynthesizer,
  SimulatedAudioPlayer,
  AudioTachieQueue,
  type VoiceInputState,
  type VoiceInputControllerOptions,
  VoiceInputController
} from '@baishou/shared'
export * from './inference-dir-scanner'
export * from './gpt-sovits.service'
