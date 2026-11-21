import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { logger } from '@baishou/shared'

export interface PetConfig {
  enabled: boolean
  x?: number
  y?: number
  scale: number // 0.5 ~ 1.5, default 1.0
  tachieDir: string
  inferenceDir: string
  ttsEnabled: boolean
  baseWidth: number
  baseHeight: number
}

const DEFAULT_PET_CONFIG: PetConfig = {
  enabled: true,
  scale: 1.0,
  tachieDir: '',
  inferenceDir: 'K:\\GPT-SoVITS',
  ttsEnabled: true,
  baseWidth: 320,
  baseHeight: 480
}

export class PetWindowManager {
  private static instance: PetWindowManager | null = null
  private petWindow: BrowserWindow | null = null
  private config: PetConfig = { ...DEFAULT_PET_CONFIG }
  private configPath: string

  private constructor() {
    this.configPath = join(app.getPath('userData'), 'pet-config.json')
    this.loadConfig()
  }

  public static getInstance(): PetWindowManager {
    if (!PetWindowManager.instance) {
      PetWindowManager.instance = new PetWindowManager()
    }
    return PetWindowManager.instance
  }

  private loadConfig(): void {
    try {
      if (existsSync(this.configPath)) {
        const raw = readFileSync(this.configPath, 'utf8')
        const parsed = JSON.parse(raw)
        this.config = { ...DEFAULT_PET_CONFIG, ...parsed }
      }
    } catch (e: any) {
      logger.warn('[PetWindowManager] 读取 pet-config.json 失败，使用默认配置:', e)
    }
  }

  public saveConfig(patch?: Partial<PetConfig>): void {
    if (patch) {
      this.config = { ...this.config, ...patch }
    }
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      const [x, y] = this.petWindow.getPosition()
      this.config.x = x
      this.config.y = y
    }
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8')
    } catch (e: any) {
      logger.warn('[PetWindowManager] 保存 pet-config.json 失败:', e)
    }
  }

  public getConfig(): PetConfig {
    return { ...this.config }
  }

  public getPetWindow(): BrowserWindow | null {
    return this.petWindow
  }

  public createPetWindow(): BrowserWindow {
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      this.petWindow.show()
      this.petWindow.focus()
      return this.petWindow
    }

    const { baseWidth, baseHeight, scale } = this.config
    const width = Math.round(baseWidth * scale)
    const height = Math.round(baseHeight * scale)

    // 计算默认位置：屏幕右下角（留出边距）
    let initialX = this.config.x
    let initialY = this.config.y

    if (initialX === undefined || initialY === undefined) {
      const primaryDisplay = screen.getPrimaryDisplay()
      const { workArea } = primaryDisplay
      initialX = workArea.x + workArea.width - width - 40
      initialY = workArea.y + workArea.height - height - 40
    }

    this.petWindow = new BrowserWindow({
      width,
      height,
      x: initialX,
      y: initialY,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    // 设置跨平台顶层悬浮（Windows 上 screen-saver 或 floating 确保在全屏代码编辑器上方置顶）
    this.petWindow.setAlwaysOnTop(true, 'screen-saver')

    const baseUrl =
      is.dev && process.env['ELECTRON_RENDERER_URL']
        ? process.env['ELECTRON_RENDERER_URL']
        : join(__dirname, '../renderer/index.html')

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      void this.petWindow.loadURL(`${baseUrl}#/pet`)
    } else {
      void this.petWindow.loadFile(baseUrl, { hash: '/pet' })
    }

    this.petWindow.once('ready-to-show', () => {
      this.petWindow?.show()
    })

    this.petWindow.on('moved', () => {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        const [x, y] = this.petWindow.getPosition()
        this.config.x = x
        this.config.y = y
        this.saveConfig()
      }
    })

    this.petWindow.on('closed', () => {
      this.petWindow = null
    })

    return this.petWindow
  }

  public setIgnoreMouseEvents(ignore: boolean): void {
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      this.petWindow.setIgnoreMouseEvents(ignore, { forward: true })
    }
  }

  public setPosition(x: number, y: number): void {
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      this.petWindow.setPosition(Math.round(x), Math.round(y))
      this.config.x = x
      this.config.y = y
      this.saveConfig()
    }
  }

  public moveBy(dx: number, dy: number): void {
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      const [curX, curY] = this.petWindow.getPosition()
      this.setPosition(curX + dx, curY + dy)
    }
  }

  public setScale(scale: number): void {
    const clamped = Math.max(0.5, Math.min(1.5, scale))
    this.config.scale = clamped
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      const width = Math.round(this.config.baseWidth * clamped)
      const height = Math.round(this.config.baseHeight * clamped)
      this.petWindow.setSize(width, height)
    }
    this.saveConfig()
    this.sendToPet('pet:scale-changed', clamped)
  }

  public show(): void {
    if (!this.petWindow || this.petWindow.isDestroyed()) {
      this.createPetWindow()
    } else {
      this.petWindow.show()
    }
    this.config.enabled = true
    this.saveConfig()
  }

  public hide(): void {
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      this.petWindow.hide()
    }
    this.config.enabled = false
    this.saveConfig()
  }

  public toggle(): boolean {
    if (this.petWindow && !this.petWindow.isDestroyed() && this.petWindow.isVisible()) {
      this.hide()
      return false
    } else {
      this.show()
      return true
    }
  }

  public sendToPet(channel: string, ...args: any[]): void {
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      this.petWindow.webContents.send(channel, ...args)
    }
  }
}
