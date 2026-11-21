import { ipcRenderer } from 'electron'

export const petApi = {
  pet: {
    getConfig: () => ipcRenderer.invoke('pet:get-config'),
    saveConfig: (patch: any) => ipcRenderer.invoke('pet:save-config', patch),
    setIgnoreMouse: (ignore: boolean) => ipcRenderer.invoke('pet:set-ignore-mouse', ignore),
    setPosition: (x: number, y: number) => ipcRenderer.invoke('pet:set-position', x, y),
    moveBy: (dx: number, dy: number) => ipcRenderer.invoke('pet:move-by', dx, dy),
    setScale: (scale: number) => ipcRenderer.invoke('pet:set-scale', scale),
    show: () => ipcRenderer.invoke('pet:show'),
    hide: () => ipcRenderer.invoke('pet:hide'),
    toggle: () => ipcRenderer.invoke('pet:toggle'),
    selectTachieDir: () => ipcRenderer.invoke('pet:select-tachie-dir'),
    selectInferenceDir: () => ipcRenderer.invoke('pet:select-inference-dir'),
    openMainWindow: () => ipcRenderer.invoke('pet:open-main-window'),
    speak: (rawText: string) => ipcRenderer.invoke('pet:speak', rawText),
    abortSpeech: () => ipcRenderer.invoke('pet:abort-speech'),
    captureScreen: () => ipcRenderer.invoke('pet:capture-screen'),
    chat: (args: { text: string; attachments?: any[]; sessionId?: string }) =>
      ipcRenderer.invoke('pet:chat', args),
    getWindowPerception: () => ipcRenderer.invoke('pet:get-window-perception'),
    setWindowPerception: (enabled: boolean) =>
      ipcRenderer.invoke('pet:set-window-perception', enabled),
    onSpeak: (callback: (rawText: string) => void) => {
      const handler = (_: any, rawText: string) => callback(rawText)
      ipcRenderer.on('pet:speak', handler)
      return () => ipcRenderer.off('pet:speak', handler)
    },
    onAbortSpeech: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('pet:abort-speech', handler)
      return () => ipcRenderer.off('pet:abort-speech', handler)
    },
    onTachieDirChanged: (callback: (dir: string) => void) => {
      const handler = (_: any, dir: string) => callback(dir)
      ipcRenderer.on('pet:tachie-dir-changed', handler)
      return () => ipcRenderer.off('pet:tachie-dir-changed', handler)
    },
    onScaleChanged: (callback: (scale: number) => void) => {
      const handler = (_: any, scale: number) => callback(scale)
      ipcRenderer.on('pet:scale-changed', handler)
      return () => ipcRenderer.off('pet:scale-changed', handler)
    }
  }
}
