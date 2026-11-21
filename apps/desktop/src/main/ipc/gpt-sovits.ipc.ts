import { ipcMain, dialog } from 'electron'
import { fileSystem } from '../services/node-file-system'
import {
  GptSovitsService,
  type GptSovitsConfig,
  type SynthesizeOptions,
  type BanXiaMood,
  type VoiceMoodEntry
} from '@baishou/core'
import { logger } from '@baishou/shared'

let gptSovitsServiceInstance: GptSovitsService | null = null

export function getGptSovitsService(): GptSovitsService {
  if (!gptSovitsServiceInstance) {
    gptSovitsServiceInstance = new GptSovitsService(fileSystem, {
      apiEndpoint: 'http://127.0.0.1:9880',
      inferenceDir: 'K:\\GPT-SoVITS',
      enabled: true
    })
  }
  return gptSovitsServiceInstance
}

export function registerGptSovitsIPC(): void {
  const service = getGptSovitsService()

  ipcMain.handle('tts:get-config', async () => {
    return service.getConfig()
  })

  ipcMain.handle('tts:update-config', async (_event, patch: Partial<GptSovitsConfig>) => {
    service.updateConfig(patch)
    return service.getConfig()
  })

  ipcMain.handle('tts:scan-inference-dir', async (_event, dirPath?: string) => {
    return service.scanInferenceDir(dirPath)
  })

  ipcMain.handle('tts:set-gpt-weights', async (_event, weightsPath: string) => {
    return service.setGptWeights(weightsPath)
  })

  ipcMain.handle('tts:set-sovits-weights', async (_event, weightsPath: string) => {
    return service.setSovitsWeights(weightsPath)
  })

  ipcMain.handle('tts:synthesize', async (_event, options: SynthesizeOptions) => {
    const res = await service.synthesize(options)
    // 注意：Uint8Array / Buffer 跨 IPC 传输，保留为 buffer 返回
    if (res.audioBuffer) {
      return {
        ...res,
        audioBuffer: Buffer.from(res.audioBuffer)
      }
    }
    return res
  })

  ipcMain.handle('tts:check-health', async () => {
    return service.checkHealth()
  })

  ipcMain.handle('tts:get-mood-map', async () => {
    return service.getMoodMap()
  })

  ipcMain.handle('tts:set-mood-entry', async (_event, mood: BanXiaMood, entry: VoiceMoodEntry) => {
    service.setMoodEntry(mood, entry)
    return service.getMoodMap()
  })

  ipcMain.handle('tts:select-inference-dir', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择本地 GPT-SoVITS-v2proplus 推理文件夹',
      properties: ['openDirectory']
    })
    if (!result.canceled && result.filePaths.length > 0) {
      const selectedDir = result.filePaths[0]
      const scanResult = await service.scanInferenceDir(selectedDir)
      return { dir: selectedDir, scanResult }
    }
    return null
  })

  ipcMain.handle('tts:select-ref-audio', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择参考音频文件',
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['wav', 'mp3'] }]
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })

  logger.info('[GPT-SoVITS] IPC handlers registered successfully')
}
