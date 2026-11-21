import { ipcRenderer } from 'electron'

export const promptWorkbenchApi = {
  promptWorkbench: {
    getConfig: () => ipcRenderer.invoke('prompt-workbench:get-config'),
    saveConfig: (config: any) => ipcRenderer.invoke('prompt-workbench:save-config', config),
    getAssembledPrompt: (args?: { sessionId?: string; overrides?: any }) =>
      ipcRenderer.invoke('prompt-workbench:get-assembled-prompt', args),
    getDefaults: () => ipcRenderer.invoke('prompt-workbench:get-defaults')
  }
}
