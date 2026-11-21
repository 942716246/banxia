export type BanXiaMood =
  | 'neutral'
  | 'happiness'
  | 'sadness'
  | 'anger'
  | 'fear'
  | 'teasing'
  | 'shy'

export type BanXiaTachie =
  | '正常'
  | '开心'
  | '害羞'
  | '生气'
  | '难过'
  | '坏笑'

export interface SpeechSegment {
  text: string // 100% 纯净自然语言，用于 TTS 合成、数据库持久化与 RAG 索引
  rawText: string
  mood: BanXiaMood
  tachie: BanXiaTachie
}

const MOOD_TO_TACHIE: Record<BanXiaMood, BanXiaTachie> = {
  neutral: '正常',
  happiness: '开心',
  sadness: '难过',
  anger: '生气',
  fear: '难过',
  teasing: '坏笑',
  shy: '害羞'
}

const TACHIE_TO_MOOD: Record<BanXiaTachie, BanXiaMood> = {
  正常: 'neutral',
  开心: 'happiness',
  害羞: 'shy',
  生气: 'anger',
  难过: 'sadness',
  坏笑: 'teasing'
}

const CHINESE_MOOD_MAP: Record<string, BanXiaMood> = {
  正常: 'neutral',
  平静: 'neutral',
  开心: 'happiness',
  高兴: 'happiness',
  得意: 'happiness',
  害羞: 'shy',
  脸红: 'shy',
  生气: 'anger',
  愤怒: 'anger',
  难过: 'sadness',
  悲伤: 'sadness',
  沮丧: 'sadness',
  坏笑: 'teasing',
  调侃: 'teasing',
  调戏: 'teasing',
  害怕: 'fear',
  惊恐: 'fear'
}

/**
 * 剥离文本中包含的所有控制标签（如 `[mood:teasing|tachie:坏笑]`、`[开心]`、`【难过】`、`(生气)` 等），
 * 确保入库与展示的文本 100% 纯净。
 */
export function stripSpeechTags(text: string): string {
  if (!text) return ''
  return text
    // 匹配 [mood:xxx|tachie:yyy] 或 [mood:xxx] 或 [tachie:yyy]
    .replace(/\[\s*(?:mood\s*:\s*[\w\u4e00-\u9fa5]+|\s*tachie\s*:\s*[\w\u4e00-\u9fa5]+)(?:\s*\|\s*(?:mood\s*:\s*[\w\u4e00-\u9fa5]+|\s*tachie\s*:\s*[\w\u4e00-\u9fa5]+))*\s*\]/gi, '')
    // 匹配中括号/方括号情绪标签，如 [开心]、[坏笑]、[happiness]
    .replace(/\[\s*(?:正常|平静|开心|高兴|得意|害羞|脸红|生气|愤怒|难过|悲伤|沮丧|坏笑|调侃|调戏|害怕|惊恐|neutral|happiness|sadness|anger|fear|teasing|shy)\s*\]/gi, '')
    // 匹配中文六角括号情绪标签，如 【开心】、【坏笑】
    .replace(/【\s*(?:正常|平静|开心|高兴|得意|害羞|脸红|生气|愤怒|难过|悲伤|沮丧|坏笑|调侃|调戏|害怕|惊恐|neutral|happiness|sadness|anger|fear|teasing|shy)\s*】/gi, '')
    // 匹配圆括号情绪标签，如 (坏笑)、(害羞)
    .replace(/\(\s*(?:正常|平静|开心|高兴|得意|害羞|脸红|生气|愤怒|难过|悲伤|沮丧|坏笑|调侃|调戏|害怕|惊恐)\s*\)/gi, '')
    .trim()
}

/**
 * 从一段包含情绪/立绘标记的原文本中解析出 mood 与 tachie
 */
export function extractMoodAndTachie(segmentText: string): {
  mood: BanXiaMood
  tachie: BanXiaTachie
} {
  // 1. 尝试匹配显式复合标签: [mood:teasing|tachie:坏笑]
  const complexMatch = segmentText.match(
    /\[(?:mood\s*:\s*([a-zA-Z\u4e00-\u9fa5]+))?(?:\s*\|\s*)?(?:tachie\s*:\s*([a-zA-Z\u4e00-\u9fa5]+))?\]/i
  )
  if (complexMatch) {
    const rawMood = complexMatch[1]?.toLowerCase()
    const rawTachie = complexMatch[2]

    let resolvedMood: BanXiaMood | undefined
    let resolvedTachie: BanXiaTachie | undefined

    if (rawMood) {
      if (rawMood in MOOD_TO_TACHIE) {
        resolvedMood = rawMood as BanXiaMood
      } else if (rawMood in CHINESE_MOOD_MAP) {
        resolvedMood = CHINESE_MOOD_MAP[rawMood]
      }
    }

    if (rawTachie && rawTachie in TACHIE_TO_MOOD) {
      resolvedTachie = rawTachie as BanXiaTachie
    }

    if (resolvedMood && !resolvedTachie) {
      resolvedTachie = MOOD_TO_TACHIE[resolvedMood]
    } else if (resolvedTachie && !resolvedMood) {
      resolvedMood = TACHIE_TO_MOOD[resolvedTachie]
    }

    if (resolvedMood && resolvedTachie) {
      return { mood: resolvedMood, tachie: resolvedTachie }
    }
  }

  // 2. 尝试匹配中括号简单标签: [开心] / [teasing]
  const simpleMatch = segmentText.match(/\[([a-zA-Z\u4e00-\u9fa5]+)\]/)
  if (simpleMatch && simpleMatch[1]) {
    const key = simpleMatch[1].trim()
    const lowerKey = key.toLowerCase()
    if (lowerKey in MOOD_TO_TACHIE) {
      const mood = lowerKey as BanXiaMood
      return { mood, tachie: MOOD_TO_TACHIE[mood] }
    }
    if (key in CHINESE_MOOD_MAP) {
      const mood = CHINESE_MOOD_MAP[key]!
      return { mood, tachie: MOOD_TO_TACHIE[mood] }
    }
    if (key in TACHIE_TO_MOOD) {
      const tachie = key as BanXiaTachie
      return { mood: TACHIE_TO_MOOD[tachie], tachie }
    }
  }

  // 3. 尝试匹配【开心】或 (开心)
  const bracketMatch = segmentText.match(/[【(]([a-zA-Z\u4e00-\u9fa5]+)[】)]/)
  if (bracketMatch && bracketMatch[1]) {
    const key = bracketMatch[1].trim()
    if (key in CHINESE_MOOD_MAP) {
      const mood = CHINESE_MOOD_MAP[key]!
      return { mood, tachie: MOOD_TO_TACHIE[mood] }
    }
  }

  // 4. 默认回退到中性/正常
  return { mood: 'neutral', tachie: '正常' }
}

/**
 * 将整段文本按句末标点（。！？!?\n）分句，并解析出每句对应的纯文本、情绪与立绘表情。
 */
export function parseSpeechSegments(rawText: string): SpeechSegment[] {
  if (!rawText || !rawText.trim()) {
    return []
  }

  // 按句末标点切分，保留标点
  // 匹配句子内容 + 尾随的标点符号
  const regex = /([^。！？!?\n]+[。！？!?\n]*|[。！？!?\n]+)/g
  const rawSegments: string[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(rawText)) !== null) {
    const segment = match[0].trim()
    if (segment) {
      rawSegments.push(segment)
    }
  }

  // 如果未能通过标点分句，则整体作为一句
  if (rawSegments.length === 0) {
    rawSegments.push(rawText.trim())
  }

  const results: SpeechSegment[] = []
  let currentMood: BanXiaMood = 'neutral'
  let currentTachie: BanXiaTachie = '正常'

  for (const raw of rawSegments) {
    // 检查此句是否有新标签
    const detected = extractMoodAndTachie(raw)
    if (detected.mood !== 'neutral' || detected.tachie !== '正常') {
      currentMood = detected.mood
      currentTachie = detected.tachie
    }

    const clean = stripSpeechTags(raw)
    if (clean) {
      results.push({
        text: clean,
        rawText: raw,
        mood: currentMood,
        tachie: currentTachie
      })
    }
  }

  return results
}
