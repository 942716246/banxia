import * as path from 'path'
import { logger } from '@baishou/shared'
import type { IFileSystem } from '../fs/file-system.types'
import type { BanXiaMood } from './speech-segment.parser'
import type { InferenceDirScanResult, RefAudioItem, ScannedAudioFile, VoiceMoodMap } from './gpt-sovits.types'

const MOOD_ALIASES: Record<string, BanXiaMood> = {
  neutral: 'neutral',
  正常: 'neutral',
  平静: 'neutral',
  default: 'neutral',
  happiness: 'happiness',
  开心: 'happiness',
  高兴: 'happiness',
  得意: 'happiness',
  happy: 'happiness',
  sadness: 'sadness',
  难过: 'sadness',
  悲伤: 'sadness',
  sad: 'sadness',
  anger: 'anger',
  生气: 'anger',
  愤怒: 'anger',
  angry: 'anger',
  fear: 'fear',
  害怕: 'fear',
  惊恐: 'fear',
  scared: 'fear',
  teasing: 'teasing',
  坏笑: 'teasing',
  调侃: 'teasing',
  调戏: 'teasing',
  smirk: 'teasing',
  shy: 'shy',
  害羞: 'shy',
  脸红: 'shy'
}

/**
 * 递归扫描目录（限制深度 4 层，避免死循环）
 */
async function scanDirRecursive(
  fileSystem: IFileSystem,
  currentDir: string,
  depth = 0
): Promise<string[]> {
  if (depth > 4) return []
  const results: string[] = []
  try {
    const entries = await fileSystem.readdir(currentDir)
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry)
      try {
        const stat = await fileSystem.stat(fullPath)
        if (stat.isDirectory) {
          const sub = await scanDirRecursive(fileSystem, fullPath, depth + 1)
          results.push(...sub)
        } else if (stat.isFile) {
          results.push(fullPath)
        }
      } catch {
        // ignore single entry stat error
      }
    }
  } catch (e: any) {
    logger.warn(`[InferenceDirScanner] 无法读取目录: ${currentDir}`, e)
  }
  return results
}

/**
 * 本地 GPT-SoVITS-v2proplus 推理文件夹扫描器
 *
 * 1. 发现所有 .ckpt (GPT) 与 .pth (SoVITS) 模型权重
 * 2. 兼容三种参考音频解析方式：
 *    - 格式 1：voice_mood_map.json 映射文件
 *    - 格式 2：同名标注文件（.lab / .txt）
 *    - 格式 3：文件名内嵌情绪与参考台词（如 `【开心】台词.wav`）
 */
const IGNORED_SUBDIR_NAMES = new Set([
  'audios',
  'audio',
  'wav',
  'wavs',
  'voices',
  'samples',
  'data',
  'weights',
  'models',
  'ref',
  'refs',
  'reference',
  'references'
])

export async function scanInferenceDirectory(
  dirPath: string,
  fileSystem: IFileSystem
): Promise<InferenceDirScanResult> {
  const gptWeights: string[] = []
  const sovitsWeights: string[] = []
  const audioFiles: ScannedAudioFile[] = []
  const moodMap: Partial<VoiceMoodMap> = {}
  const moodPools: Record<string, RefAudioItem[]> = {}
  let voiceMoodMapJsonPath: string | undefined

  if (!(await fileSystem.exists(dirPath))) {
    return {
      inferenceDir: dirPath,
      gptWeights,
      sovitsWeights,
      moodMap,
      moodPools,
      audioFiles,
      availableMoods: ['正常', '开心', '害羞', '生气', '难过', '坏笑']
    }
  }

  const allFiles = await scanDirRecursive(fileSystem, dirPath)
  const fileSet = new Set(allFiles)

  // 1. 优先检查是否存在 voice_mood_map.json
  const jsonCandidate = allFiles.find(
    (f) => path.basename(f).toLowerCase() === 'voice_mood_map.json'
  )
  if (jsonCandidate) {
    voiceMoodMapJsonPath = jsonCandidate
    try {
      const jsonContent = await fileSystem.readFile(jsonCandidate, 'utf8')
      const parsed = JSON.parse(jsonContent)
      const baseDir = path.dirname(jsonCandidate)

      const targetMoods = parsed.moods || parsed.overrides || parsed
      if (typeof targetMoods === 'object' && targetMoods !== null) {
        for (const [key, val] of Object.entries(targetMoods)) {
          const items = Array.isArray(val) ? val : [val]
          for (const item of items) {
            if (typeof item !== 'object' || item === null) continue

            const valObj = item as any
            const audioRelOrAbs = valObj.audio || valObj.audioPath || valObj.path || ''
            const prompt = valObj.prompt || valObj.promptText || valObj.text || ''
            const lang = valObj.lang || valObj.promptLang || 'ja'

            const audioPath = path.isAbsolute(audioRelOrAbs)
              ? audioRelOrAbs
              : path.join(baseDir, audioRelOrAbs)

            const refItem: RefAudioItem = {
              audioPath,
              promptText: prompt,
              promptLang: lang
            }

            const pool = moodPools[key] ?? (moodPools[key] = [])
            pool.push(refItem)

            const alias = MOOD_ALIASES[key.toLowerCase()]
            if (alias && alias !== key) {
              const aliasPool = moodPools[alias] ?? (moodPools[alias] = [])
              aliasPool.push(refItem)
            }

            if (!moodMap[key as BanXiaMood]) {
              moodMap[key as BanXiaMood] = refItem
            }
            if (alias && !moodMap[alias]) {
              moodMap[alias] = refItem
            }
          }
        }
      }
    } catch (e: any) {
      logger.warn('[InferenceDirScanner] voice_mood_map.json 解析失败:', e)
    }
  }

  // 2. 遍历所有文件，分类 .ckpt、.pth 与音频文件
  for (const filePath of allFiles) {
    const ext = path.extname(filePath).toLowerCase()
    const baseName = path.basename(filePath, ext)

    if (ext === '.ckpt') {
      gptWeights.push(filePath)
    } else if (ext === '.pth') {
      sovitsWeights.push(filePath)
    } else if (ext === '.wav' || ext === '.mp3') {
      let rawMoodName: string | undefined
      let detectedMood: BanXiaMood | undefined
      let promptText: string | undefined
      let promptLang = 'ja'

      // 格式 3：检查文件名中是否内嵌【情绪】或 [mood]
      const bracketMatch = baseName.match(/^[【\[]([a-zA-Z\u4e00-\u9fa5]+)[】\]](.*)$/)
      if (bracketMatch && bracketMatch[1]) {
        rawMoodName = bracketMatch[1].trim()
        const rawPrompt = bracketMatch[2]?.trim()
        if (rawPrompt) {
          promptText = rawPrompt
        }
      } else {
        // 检查父级子目录名是否作为情绪分类（例如 /开心/01.wav），忽略 generic 目录（audios/voices 等）
        const relDir = path.relative(dirPath, path.dirname(filePath))
        const parts = relDir.split(/[\\/]/).filter((p) => p && p !== '.')
        if (parts.length > 0 && parts[0]) {
          const candidate = parts[0].trim().toLowerCase()
          if (!IGNORED_SUBDIR_NAMES.has(candidate)) {
            if (MOOD_ALIASES[candidate] || /^[a-zA-Z\u4e00-\u9fa5]+$/.test(candidate)) {
              rawMoodName = parts[0].trim()
            }
          }
        }
      }

      if (!rawMoodName) {
        // 尝试从文件名中的关键词猜测情绪
        for (const [alias] of Object.entries(MOOD_ALIASES)) {
          if (baseName.includes(alias)) {
            rawMoodName = alias
            break
          }
        }
      }

      if (rawMoodName) {
        detectedMood = MOOD_ALIASES[rawMoodName.toLowerCase()] || rawMoodName
      }

      // 格式 2：检查同目录下是否存在同名 .lab 或 .txt 文件
      const dirOfFile = path.dirname(filePath)
      const labPath = path.join(dirOfFile, `${baseName}.lab`)
      const txtPath = path.join(dirOfFile, `${baseName}.txt`)

      if (fileSet.has(labPath)) {
        try {
          const labContent = await fileSystem.readFile(labPath, 'utf8')
          if (labContent.trim()) {
            promptText = labContent.trim()
          }
        } catch {
          // ignore read error
        }
      } else if (fileSet.has(txtPath)) {
        try {
          const txtContent = await fileSystem.readFile(txtPath, 'utf8')
          if (txtContent.trim()) {
            promptText = txtContent.trim()
          }
        } catch {
          // ignore read error
        }
      }

      // 若未从 .lab/.txt 或【情绪】后提取到 promptText，则默认用文件名作为 promptText
      if (!promptText) {
        promptText = baseName
      }

      // 简易推断 promptLang：如果包含日文字符，设为 'ja'，否则设为 'zh'
      if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(promptText)) {
        promptLang = 'ja'
      } else if (/[\u4e00-\u9fa5]/.test(promptText)) {
        promptLang = 'zh'
      }

      const scannedAudio: ScannedAudioFile = {
        path: filePath,
        name: path.basename(filePath),
        detectedMood,
        promptText,
        promptLang
      }
      audioFiles.push(scannedAudio)

      const audioRef: RefAudioItem = {
        audioPath: filePath,
        promptText,
        promptLang
      }

      // 填充情绪池
      if (rawMoodName) {
        const pool = moodPools[rawMoodName] ?? (moodPools[rawMoodName] = [])
        pool.push(audioRef)
      }
      if (detectedMood && detectedMood !== rawMoodName) {
        const pool = moodPools[detectedMood] ?? (moodPools[detectedMood] = [])
        pool.push(audioRef)
      }

      // 如果尚未在 moodMap 中映射该情绪，且成功识别到了情绪，则自动填充首项
      if (detectedMood && !moodMap[detectedMood]) {
        moodMap[detectedMood] = audioRef
      }
    }
  }

  // 如果没有识别到 neutral，但有音频文件，将第一个音频文件作为 neutral 兜底
  if (!moodMap.neutral && audioFiles.length > 0 && audioFiles[0]) {
    const first = audioFiles[0]
    const defaultRef: RefAudioItem = {
      audioPath: first.path,
      promptText: first.promptText || first.name,
      promptLang: first.promptLang || 'ja'
    }
    moodMap.neutral = defaultRef
    if (!moodPools.neutral) moodPools.neutral = [defaultRef]
    if (!moodPools['正常']) moodPools['正常'] = [defaultRef]
  }

  const moodSet = new Set<string>()
  for (const k of Object.keys(moodPools)) {
    if (k && !['neutral', 'happiness', 'sadness', 'anger', 'fear', 'teasing', 'shy'].includes(k)) {
      moodSet.add(k)
    }
  }
  if (moodSet.size === 0) {
    ;['正常', '开心', '害羞', '生气', '难过', '坏笑'].forEach((m) => moodSet.add(m))
  }
  const availableMoods = Array.from(moodSet)

  return {
    inferenceDir: dirPath,
    gptWeights,
    sovitsWeights,
    moodMap,
    moodPools,
    audioFiles,
    voiceMoodMapJsonPath,
    availableMoods
  }
}
