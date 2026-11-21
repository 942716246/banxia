import { ipcMain, dialog, BrowserWindow, desktopCapturer } from 'electron'
import * as crypto from 'crypto'
import { PetWindowManager } from '../windows/pet.window'
import { getGptSovitsService } from './gpt-sovits.ipc'
import { AgentChatService } from './AgentChatService'
import { DesktopPerceptionService } from '../services/desktop-perception.service'
import { getAgentManagers } from './agent-helpers'
import { resolveActiveVault } from './vault.ipc'
import { deriveLegacyVaultId, logger } from '@baishou/shared'

export function registerPetIPC(getMainWindow: () => BrowserWindow | null): void {
  const manager = PetWindowManager.getInstance()

  ipcMain.handle('pet:get-config', async () => {
    return manager.getConfig()
  })

  ipcMain.handle('pet:save-config', async (_event, patch) => {
    manager.saveConfig(patch)
    return manager.getConfig()
  })

  ipcMain.handle('pet:set-ignore-mouse', async (_event, ignore: boolean) => {
    manager.setIgnoreMouseEvents(ignore)
    return true
  })

  ipcMain.handle('pet:set-position', async (_event, x: number, y: number) => {
    manager.setPosition(x, y)
    return true
  })

  ipcMain.handle('pet:move-by', async (_event, dx: number, dy: number) => {
    manager.moveBy(dx, dy)
    return true
  })

  ipcMain.handle('pet:set-scale', async (_event, scale: number) => {
    manager.setScale(scale)
    return manager.getConfig()
  })

  ipcMain.handle('pet:show', async () => {
    manager.show()
    return true
  })

  ipcMain.handle('pet:hide', async () => {
    manager.hide()
    return true
  })

  ipcMain.handle('pet:toggle', async () => {
    return manager.toggle()
  })

  ipcMain.handle('pet:select-tachie-dir', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择半夏立绘文件夹（包含 正常.png/开心.png/害羞.png 等）',
      properties: ['openDirectory']
    })
    if (!result.canceled && result.filePaths.length > 0) {
      const selectedDir = result.filePaths[0]
      manager.saveConfig({ tachieDir: selectedDir })
      manager.sendToPet('pet:tachie-dir-changed', selectedDir)
      return selectedDir
    }
    return null
  })

  ipcMain.handle('pet:select-inference-dir', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择本地 GPT-SoVITS-v2proplus 推理文件夹',
      properties: ['openDirectory']
    })
    if (!result.canceled && result.filePaths.length > 0) {
      const selectedDir = result.filePaths[0]
      manager.saveConfig({ inferenceDir: selectedDir })
      const service = getGptSovitsService()
      const scanResult = await service.scanInferenceDir(selectedDir)
      manager.sendToPet('pet:inference-dir-changed', { dir: selectedDir, scanResult })
      return { dir: selectedDir, scanResult }
    }
    return null
  })

  ipcMain.handle('pet:open-main-window', async () => {
    const mainWin = getMainWindow()
    if (mainWin && !mainWin.isDestroyed()) {
      if (mainWin.isMinimized()) mainWin.restore()
      if (!mainWin.isVisible()) mainWin.show()
      mainWin.focus()
      return true
    }
    return false
  })

  ipcMain.handle('pet:speak', async (_event, rawText: string) => {
    manager.sendToPet('pet:speak', rawText)
    return true
  })

  ipcMain.handle('pet:abort-speech', async () => {
    manager.sendToPet('pet:abort-speech')
    return true
  })

  ipcMain.handle('pet:capture-screen', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1280, height: 720 }
      })
      const screen = sources[0]
      if (screen) {
        return {
          dataUrl: screen.thumbnail.toDataURL(),
          name: screen.name
        }
      }
      return null
    } catch (e: any) {
      logger.error('[PetIPC] 截图失败:', e)
      return null
    }
  })

  ipcMain.handle(
    'pet:chat',
    async (
      event,
      args: {
        text: string
        attachments?: any[]
        sessionId?: string
      }
    ) => {
      try {
        const { sessionManager } = getAgentManagers()
        const activeVault = resolveActiveVault()
        const activeVaultId = activeVault.id
        const nameDerived = deriveLegacyVaultId(activeVault.name || 'Personal')
        const defaultPersonalDerived = deriveLegacyVaultId('Personal')
        const vaultCandidateIds = Array.from(
          new Set([activeVaultId, nameDerived, defaultPersonalDerived].filter(Boolean))
        )

        let sessionId = args.sessionId
        if (!sessionId) {
          const sessions = await sessionManager.findAllSessions(
            1,
            0,
            undefined,
            undefined,
            vaultCandidateIds
          )
          if (sessions && sessions.length > 0) {
            sessionId = sessions[0].id
          } else {
            sessionId = crypto.randomUUID()
            await sessionManager.upsertSession({
              id: sessionId,
              vaultId: activeVaultId,
              title: '半夏桌宠对话'
            } as any)
          }
        }

        const result = await AgentChatService.chat(event, {
          sessionId,
          text: args.text,
          attachments: args.attachments
        })
        return result !== false
      } catch (e: any) {
        logger.error('[PetIPC] pet:chat 失败:', e)
        return false
      }
    }
  )

  ipcMain.handle('pet:get-window-perception', async () => {
    return DesktopPerceptionService.getInstance().isEnabled()
  })

  ipcMain.handle('pet:set-window-perception', async (_event, enabled: boolean) => {
    DesktopPerceptionService.getInstance().setEnabled(enabled)
    return enabled
  })

  logger.info('[PetWindowManager] IPC handlers registered successfully')
}
