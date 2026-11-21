import { ipcMain } from 'electron'
import { settingsManager } from './settings.ipc'
import { buildAgentSystemPrompt } from './build-agent-system-prompt'
import {
  BANXIA_CORE_PERSONA,
  HUNXIAOXIAO_USER_IDENTITY
} from '@baishou/shared'
import { DEFAULT_EXPRESSION_PROTOCOL_TEMPLATE } from '@baishou/ai'

export interface PromptPresetItem {
  name: string
  personaPrompt?: string
  userIdentityPrompt?: string
  companionAndToolPrompt?: string
  expressionProtocolTemplate?: string
}

export interface PromptWorkbenchConfig {
  personaPrompt?: string
  userIdentityPrompt?: string
  companionAndToolPrompt?: string
  expressionProtocolTemplate?: string
  activePreset?: string
  presets?: Record<string, PromptPresetItem>
}

const DEFAULT_CONFIG: PromptWorkbenchConfig = {
  personaPrompt: '',
  userIdentityPrompt: '',
  companionAndToolPrompt: '',
  expressionProtocolTemplate: '',
  activePreset: 'default',
  presets: {}
}

export function registerPromptWorkbenchIPC(): void {
  ipcMain.handle('prompt-workbench:get-config', async () => {
    const stored = await settingsManager.get<PromptWorkbenchConfig>('prompt_workbench_config')
    return { ...DEFAULT_CONFIG, ...stored }
  })

  ipcMain.handle(
    'prompt-workbench:save-config',
    async (_event, config: Partial<PromptWorkbenchConfig>) => {
      const stored =
        (await settingsManager.get<PromptWorkbenchConfig>('prompt_workbench_config')) || {}
      const merged = { ...DEFAULT_CONFIG, ...stored, ...config }
      await settingsManager.set('prompt_workbench_config', merged)
      return { ok: true, config: merged }
    }
  )

  ipcMain.handle(
    'prompt-workbench:get-assembled-prompt',
    async (
      _event,
      args?: {
        sessionId?: string
        overrides?: Partial<PromptWorkbenchConfig>
      }
    ) => {
      const stored =
        (await settingsManager.get<PromptWorkbenchConfig>('prompt_workbench_config')) || {}
      const effectiveOverrides = { ...stored, ...(args?.overrides || {}) }

      try {
        const assembled = await buildAgentSystemPrompt(
          args?.sessionId || '',
          undefined,
          {
            promptWorkbenchConfig: effectiveOverrides
          }
        )
        return assembled
      } catch (e: any) {
        return `// 构建预览失败: ${e.message || String(e)}`
      }
    }
  )

  ipcMain.handle('prompt-workbench:get-defaults', async () => {
    return {
      personaPrompt: BANXIA_CORE_PERSONA,
      userIdentityPrompt: HUNXIAOXIAO_USER_IDENTITY,
      companionAndToolPrompt: '',
      expressionProtocolTemplate: DEFAULT_EXPRESSION_PROTOCOL_TEMPLATE
    }
  })
}
