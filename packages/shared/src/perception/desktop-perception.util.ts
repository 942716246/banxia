export interface ActiveWindowInfo {
  processName: string
  windowTitle: string
  category: 'writing' | 'art' | 'gaming' | 'browsing' | 'general'
  description: string
}

export const SENSITIVE_TITLE_KEYWORDS = [
  'password',
  'bitwarden',
  '1password',
  'keepass',
  '密码',
  '银行',
  'inprivate',
  'incognito',
  '无痕',
  '隐私'
]

/**
 * 敏感隐私词脱敏过滤
 */
export function filterSensitiveTitle(title: string): string {
  const titleLower = title.toLowerCase()
  const isSensitive = SENSITIVE_TITLE_KEYWORDS.some((kw) => titleLower.includes(kw))
  return isSensitive ? '私密浏览 / 安全窗口' : title
}

/**
 * 将活动窗口按半夏生活与审美感知习惯进行语义分类
 */
export function categorizeWindow(processName: string, rawWindowTitle: string): ActiveWindowInfo {
  const windowTitle = filterSensitiveTitle(rawWindowTitle)
  const p = processName.toLowerCase()
  const t = windowTitle.toLowerCase()

  // 1. 写作 / 码字 / 编辑
  if (
    p.includes('word') ||
    p.includes('winword') ||
    p.includes('code') ||
    p.includes('typora') ||
    p.includes('obsidian') ||
    p.includes('notepad') ||
    t.includes('word') ||
    t.includes('小说') ||
    t.includes('草稿') ||
    t.includes('.md') ||
    t.includes('.txt')
  ) {
    const cleanTitle = windowTitle.split(' - ')[0]?.trim() || windowTitle
    return {
      processName,
      windowTitle,
      category: 'writing',
      description: `正在码字写稿或编辑文档《${cleanTitle}》`
    }
  }

  // 2. 绘画 / 设计 / 美术
  if (
    p.includes('photoshop') ||
    p.includes('sai') ||
    p.includes('clipstudio') ||
    p.includes('aseprite') ||
    t.includes('pixiv')
  ) {
    return {
      processName,
      windowTitle,
      category: 'art',
      description: `正在使用绘图软件或查看画作插画`
    }
  }

  // 3. 游戏感知（半夏关注的游戏与单机）
  if (
    p.includes('zenless') ||
    p.includes('starrail') ||
    p.includes('disco') ||
    t.includes('绝区零') ||
    t.includes('崩坏：星穹铁道') ||
    t.includes('星穹铁道') ||
    t.includes('极乐迪斯科') ||
    p.includes('steam')
  ) {
    const gameName = t.includes('绝区零')
      ? '绝区零'
      : t.includes('星穹铁道')
        ? '崩坏：星穹铁道'
        : t.includes('极乐迪斯科')
          ? '极乐迪斯科'
          : windowTitle || processName
    return {
      processName,
      windowTitle,
      category: 'gaming',
      description: `正在运行游戏《${gameName}》`
    }
  }

  // 4. 浏览网页与视频
  if (
    p.includes('chrome') ||
    p.includes('msedge') ||
    p.includes('firefox') ||
    p.includes('brave')
  ) {
    const cleanTitle = windowTitle.split(' - ')[0]?.trim() || windowTitle
    return {
      processName,
      windowTitle,
      category: 'browsing',
      description: `正在浏览网页或视频《${cleanTitle}》`
    }
  }

  // 5. 通用
  return {
    processName,
    windowTitle,
    category: 'general',
    description: `正在使用应用 ${processName}${windowTitle ? `（${windowTitle}）` : ''}`
  }
}

export function formatDesktopContextPrompt(win: ActiveWindowInfo | null): string | undefined {
  if (!win) return undefined
  return `当前桌面活动状态：${win.description}`
}
