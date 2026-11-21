import { ipcRenderer } from 'electron'

export const ttsApi = {
  tts: {
    getConfig: () => ipcRenderer.invoke('tts:get-config'),
    updateConfig: (patch: any) => ipcRenderer.invoke('tts:update-config', patch),
    scanInferenceDir: (dirPath?: string) => ipcRenderer.invoke('tts:scan-inference-dir', dirPath),
    setGptWeights: (weightsPath: string) => ipcRenderer.invoke('tts:set-gpt-weights', weightsPath),
    setSovitsWeights: (weightsPath: string) =>
      ipcRenderer.invoke('tts:set-sovits-weights', weightsPath),
    synthesize: (options: any) => ipcRenderer.invoke('tts:synthesize', options),
    checkHealth: () => ipcRenderer.invoke('tts:check-health'),
    getMoodMap: () => ipcRenderer.invoke('tts:get-mood-map'),
    setMoodEntry: (mood: string, entry: any) =>
      ipcRenderer.invoke('tts:set-mood-entry', mood, entry),
    selectInferenceDir: () => ipcRenderer.invoke('tts:select-inference-dir'),
    selectRefAudio: () => ipcRenderer.invoke('tts:select-ref-audio')
  }
}
