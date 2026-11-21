import { exec } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import {
  logger,
  type ActiveWindowInfo,
  categorizeWindow,
  formatDesktopContextPrompt
} from '@baishou/shared'

export type { ActiveWindowInfo }

export interface DesktopPerceptionConfig {
  enableWindowPerception: boolean
  cacheTtlMs: number
}

const DEFAULT_CONFIG: DesktopPerceptionConfig = {
  enableWindowPerception: true,
  cacheTtlMs: 3000
}

export class DesktopPerceptionService {
  private static instance: DesktopPerceptionService | null = null
  private config: DesktopPerceptionConfig = { ...DEFAULT_CONFIG }
  private configPath: string
  private cachedWindow: { info: ActiveWindowInfo | null; timestamp: number } | null = null

  private constructor() {
    this.configPath = join(app.getPath('userData'), 'desktop-perception-config.json')
    this.loadConfig()
  }

  public static getInstance(): DesktopPerceptionService {
    if (!DesktopPerceptionService.instance) {
      DesktopPerceptionService.instance = new DesktopPerceptionService()
    }
    return DesktopPerceptionService.instance
  }

  private loadConfig(): void {
    try {
      if (existsSync(this.configPath)) {
        const raw = readFileSync(this.configPath, 'utf8')
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
      }
    } catch (e: any) {
      logger.warn('[DesktopPerception] 读取配置失败，采用默认值:', e)
    }
  }

  public saveConfig(patch?: Partial<DesktopPerceptionConfig>): void {
    if (patch) {
      this.config = { ...this.config, ...patch }
    }
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8')
    } catch (e: any) {
      logger.warn('[DesktopPerception] 保存配置失败:', e)
    }
  }

  public isEnabled(): boolean {
    return this.config.enableWindowPerception
  }

  public setEnabled(enabled: boolean): void {
    this.saveConfig({ enableWindowPerception: enabled })
  }

  /**
   * 嗅探当前操作系统的前台活动窗口信息（带缓存与隐私脱敏过滤）
   */
  public async getActiveWindow(): Promise<ActiveWindowInfo | null> {
    if (!this.config.enableWindowPerception) {
      return null
    }

    const now = Date.now()
    if (
      this.cachedWindow &&
      now - this.cachedWindow.timestamp < this.config.cacheTtlMs
    ) {
      return this.cachedWindow.info
    }

    if (process.platform !== 'win32') {
      return null
    }

    try {
      const info = await this.queryWindowsForegroundWindow()
      this.cachedWindow = { info, timestamp: now }
      return info
    } catch (e: any) {
      logger.warn('[DesktopPerception] 查询前台窗口失败:', e)
      return null
    }
  }

  /**
   * 获取格式化后的桌面上下文 Prompt，供对话时静默注入 System Prompt
   */
  public async getDesktopContextPrompt(): Promise<string | undefined> {
    const win = await this.getActiveWindow()
    return formatDesktopContextPrompt(win)
  }

  /**
   * 执行 PowerShell 查询 Windows 前台活动窗口
   */
  private queryWindowsForegroundWindow(): Promise<ActiveWindowInfo | null> {
    const psScript = `
$sig = @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
'@
$type = Add-Type -MemberDefinition $sig -Name "Win32Util" -Namespace "DesktopPerception" -PassThru
$hwnd = [DesktopPerception.Win32Util]::GetForegroundWindow()
if ($hwnd -ne [IntPtr]::Zero) {
    $sb = New-Object System.Text.StringBuilder 512
    [DesktopPerception.Win32Util]::GetWindowText($hwnd, $sb, 512) | Out-Null
    $pid = 0
    [DesktopPerception.Win32Util]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    $pname = if ($proc) { $proc.ProcessName } else { "" }
    $title = $sb.ToString()
    @{ processName = $pname; windowTitle = $title } | ConvertTo-Json -Compress
}
`.trim()

    return new Promise((resolve) => {
      exec(
        `powershell -NoProfile -NonInteractive -Command "${psScript.replace(/"/g, '\\"')}"`,
        { timeout: 1500 },
        (error, stdout) => {
          if (error || !stdout.trim()) {
            resolve(null)
            return
          }
          try {
            const parsed = JSON.parse(stdout.trim())
            const proc = (parsed.processName || '').trim()
            let title = (parsed.windowTitle || '').trim()

            if (!proc && !title) {
              resolve(null)
              return
            }

            // 过滤自己的窗口（BanXia / BaiShou / Electron）
            const procLower = proc.toLowerCase()
            if (
              procLower.includes('electron') ||
              procLower.includes('baishou') ||
              procLower.includes('banxia')
            ) {
              resolve(null)
              return
            }

            const categorized = this.categorizeWindow(proc, title)
            resolve(categorized)
          } catch {
            resolve(null)
          }
        }
      )
    })
  }

  /**
   * 将活动窗口按半夏感知习惯进行语义分类
   */
  public categorizeWindow(processName: string, windowTitle: string): ActiveWindowInfo {
    return categorizeWindow(processName, windowTitle)
  }
}
