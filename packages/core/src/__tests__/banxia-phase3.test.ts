import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as path from 'node:path'
import {
  parseSpeechSegments,
  stripSpeechTags,
  scanInferenceDirectory,
  GptSovitsService,
  AudioTachieQueue,
  SimulatedAudioPlayer,
  isInteractivePixel,
  shouldIgnoreMouse
} from '@baishou/core'
import type { IFileSystem, FileStat } from '../fs/file-system.types'

/**
 * 内存虚拟文件系统，供单测使用
 */
class MemoryFileSystem implements IFileSystem {
  private files = new Map<string, string>()
  private dirs = new Set<string>()

  constructor() {
    this.dirs.add(path.normalize('/'))
  }

  public setFile(filePath: string, content: string): void {
    const norm = path.normalize(filePath)
    this.files.set(norm, content)
    let cur = path.dirname(norm)
    while (cur && cur !== '.' && !this.dirs.has(cur)) {
      this.dirs.add(cur)
      const parent = path.dirname(cur)
      if (parent === cur) break
      cur = parent
    }
  }

  async exists(p: string): Promise<boolean> {
    const norm = path.normalize(p)
    return this.files.has(norm) || this.dirs.has(norm)
  }

  async mkdir(p: string): Promise<void> {
    this.dirs.add(path.normalize(p))
  }

  async readFile(p: string): Promise<string> {
    const norm = path.normalize(p)
    if (!this.files.has(norm)) throw new Error(`ENOENT: ${p}`)
    return this.files.get(norm)!
  }

  async writeFile(p: string, data: string): Promise<void> {
    this.setFile(p, data)
  }

  async copyFile(src: string, dest: string): Promise<void> {
    const data = await this.readFile(src)
    await this.writeFile(dest, data)
  }

  async unlink(p: string): Promise<void> {
    this.files.delete(path.normalize(p))
  }

  async readdir(p: string): Promise<string[]> {
    const norm = path.normalize(p)
    const entries = new Set<string>()

    for (const d of this.dirs) {
      if (path.dirname(d) === norm && d !== norm) {
        entries.add(path.basename(d))
      }
    }
    for (const f of this.files.keys()) {
      if (path.dirname(f) === norm) {
        entries.add(path.basename(f))
      }
    }
    return Array.from(entries)
  }

  async stat(p: string): Promise<FileStat> {
    const norm = path.normalize(p)
    if (this.dirs.has(norm)) {
      return { isFile: false, isDirectory: true }
    }
    if (this.files.has(norm)) {
      return { isFile: true, isDirectory: false, size: this.files.get(norm)!.length }
    }
    throw new Error(`ENOENT: ${p}`)
  }

  async rename(oldP: string, newP: string): Promise<void> {
    const data = await this.readFile(oldP)
    await this.unlink(oldP)
    await this.writeFile(newP, data)
  }

  async rm(p: string): Promise<void> {
    const norm = path.normalize(p)
    this.files.delete(norm)
    this.dirs.delete(norm)
  }

  async appendFile(p: string, data: string): Promise<void> {
    const norm = path.normalize(p)
    const cur = this.files.get(norm) || ''
    this.files.set(norm, cur + data)
  }
}

describe('Phase 3 Task 3.1 & 3.2: Desktop Pet & Local GPT-SoVITS Integration', () => {
  describe('Speech Segment & Emotion Parser (Zero-Pollution DB/RAG Test)', () => {
    it('should split by punctuation and extract mood & tachie while stripping tags completely', () => {
      const rawText =
        '[mood:teasing|tachie:坏笑]今天又偷懒没画稿子吧？[开心]不过看你写得这么投入，这次就算啦！[生气]明天可不许再赖床了。'

      const segments = parseSpeechSegments(rawText)

      expect(segments).toHaveLength(3)

      // 第一句：坏笑
      expect(segments[0]!.text).toBe('今天又偷懒没画稿子吧？')
      expect(segments[0]!.mood).toBe('teasing')
      expect(segments[0]!.tachie).toBe('坏笑')

      // 第二句：开心
      expect(segments[1]!.text).toBe('不过看你写得这么投入，这次就算啦！')
      expect(segments[1]!.mood).toBe('happiness')
      expect(segments[1]!.tachie).toBe('开心')

      // 第三句：生气
      expect(segments[2]!.text).toBe('明天可不许再赖床了。')
      expect(segments[2]!.mood).toBe('anger')
      expect(segments[2]!.tachie).toBe('生气')

      // 铁律校验：stripSpeechTags 保证入库与展示的文本没有任何标签污染
      const pureText = stripSpeechTags(rawText)
      expect(pureText).not.toContain('[mood:')
      expect(pureText).not.toContain('[tachie:')
      expect(pureText).not.toContain('[开心]')
      expect(pureText).not.toContain('[生气]')
      expect(pureText).toContain('今天又偷懒没画稿子吧？')
      expect(pureText).toContain('不过看你写得这么投入，这次就算啦！')
      expect(pureText).toContain('明天可不许再赖床了。')
    })

    it('should handle natural Chinese bracket format 【坏笑】 and fallback gracefully', () => {
      const rawText = '【坏笑】某人昨天是不是又喝咖啡失眠了？(害羞)我随口问问而已。'
      const segments = parseSpeechSegments(rawText)

      expect(segments).toHaveLength(2)
      expect(segments[0]!.text).toBe('某人昨天是不是又喝咖啡失眠了？')
      expect(segments[0]!.mood).toBe('teasing')
      expect(segments[0]!.tachie).toBe('坏笑')

      expect(segments[1]!.text).toBe('我随口问问而已。')
      expect(segments[1]!.mood).toBe('shy')
      expect(segments[1]!.tachie).toBe('害羞')
    })

    it('should fallback to neutral / 正常 when no emotion tags exist', () => {
      const rawText = '今天南方在下雨，画室稍微有点冷。'
      const segments = parseSpeechSegments(rawText)

      expect(segments).toHaveLength(1)
      expect(segments[0]!.text).toBe('今天南方在下雨，画室稍微有点冷。')
      expect(segments[0]!.mood).toBe('neutral')
      expect(segments[0]!.tachie).toBe('正常')
    })
  })

  describe('Local Inference Directory Scanner (3 Reference Audio Formats)', () => {
    let memFs: MemoryFileSystem
    const mockInferenceDir = 'K:/GPT-SoVITS/models'

    beforeEach(() => {
      memFs = new MemoryFileSystem()
    })

    it('should discover .ckpt and .pth weight files and parse 3 ref audio formats', async () => {
      // 1. 放入模型权重
      memFs.setFile(`${mockInferenceDir}/banxia-v2.ckpt`, 'fake ckpt bytes')
      memFs.setFile(`${mockInferenceDir}/banxia_e15_s120.pth`, 'fake pth bytes')

      // 2. 格式 1：voice_mood_map.json (兼容 ZcChat2)
      const moodMapJson = JSON.stringify({
        moods: {
          teasing: {
            audio: 'audios/teasing.wav',
            prompt: '哼，才不告诉你呢。',
            lang: 'ja'
          }
        }
      })
      memFs.setFile(`${mockInferenceDir}/voice_mood_map.json`, moodMapJson)
      memFs.setFile(`${mockInferenceDir}/audios/teasing.wav`, 'wav1')

      // 3. 格式 2：同名标注文件 (xxx.lab / xxx.txt)
      memFs.setFile(`${mockInferenceDir}/audios/anger_01.wav`, 'wav2')
      memFs.setFile(`${mockInferenceDir}/audios/anger_01.lab`, 'もう、怒ったからね！')

      // 4. 格式 3：文件名内嵌情绪与台词 【开心】xxx.wav
      memFs.setFile(
        `${mockInferenceDir}/audios/【开心】今天天气真好，一起去散步吧.wav`,
        'wav3'
      )

      // 5. 格式 3b：中性默认音频
      memFs.setFile(`${mockInferenceDir}/audios/【正常】我是半夏.wav`, 'wav4')

      const result = await scanInferenceDirectory(mockInferenceDir, memFs)

      // 断言权重文件发现
      expect(result.gptWeights).toHaveLength(1)
      expect(result.gptWeights[0]).toContain('banxia-v2.ckpt')
      expect(result.sovitsWeights).toHaveLength(1)
      expect(result.sovitsWeights[0]).toContain('banxia_e15_s120.pth')

      // 断言格式 1 解析（teasing）
      expect(result.moodMap.teasing).toBeDefined()
      expect(result.moodMap.teasing?.promptText).toBe('哼，才不告诉你呢。')

      // 断言格式 2 解析（anger 读取 .lab 内容）
      expect(result.moodMap.anger).toBeDefined()
      expect(result.moodMap.anger?.promptText).toBe('もう、怒ったからね！')

      // 断言格式 3 解析（开心 读取文件名内嵌台词）
      expect(result.moodMap.happiness).toBeDefined()
      expect(result.moodMap.happiness?.promptText).toBe('今天天气真好，一起去散步吧')

      // 断言 neutral 兜底
      expect(result.moodMap.neutral).toBeDefined()
      expect(result.audioFiles.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe('GptSovitsService API & Offline Silent Degradation', () => {
    let memFs: MemoryFileSystem
    let service: GptSovitsService

    beforeEach(() => {
      memFs = new MemoryFileSystem()
      service = new GptSovitsService(memFs, {
        apiEndpoint: 'http://127.0.0.1:9880',
        enabled: true
      })
      // 设置 mock mood map
      service.setMoodEntry('neutral', {
        audioPath: 'K:/ref/normal.wav',
        promptText: 'こんにちは',
        promptLang: 'ja'
      })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should construct correct query parameters for /tts and handle successful response', async () => {
      const mockAudio = new Uint8Array([1, 2, 3, 4])
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockAudio.buffer
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await service.synthesize({
        text: '画室的味道今天稍微有点重。',
        mood: 'neutral'
      })

      expect(result.success).toBe(true)
      expect(result.audioBuffer).toBeDefined()
      expect(result.audioBuffer).toEqual(mockAudio)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const requestedUrl = mockFetch.mock.calls[0]![0] as string
      expect(requestedUrl).toContain('http://127.0.0.1:9880/tts?')
      expect(requestedUrl).toContain('text=' + encodeURIComponent('画室的味道今天稍微有点重。'))
      expect(requestedUrl).toContain('ref_audio_path=' + encodeURIComponent('K:/ref/normal.wav'))
      expect(requestedUrl).toContain('prompt_lang=ja')
      expect(requestedUrl).toContain('text_lang=zh')
    })

    it('should gracefully degrade to offline mode without throwing when local service is down', async () => {
      // 模拟 127.0.0.1:9880 未启动（ECONNREFUSED）
      const mockFetch = vi.fn().mockRejectedValue({
        code: 'ECONNREFUSED',
        message: 'fetch failed: connect ECONNREFUSED 127.0.0.1:9880'
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await service.synthesize({
        text: '你好啊。',
        mood: 'neutral'
      })

      expect(result.success).toBe(false)
      expect(result.offline).toBe(true)
      expect(result.error).toContain('offline')
    })

    it('should call set_gpt_weights and set_sovits_weights endpoints correctly', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
      vi.stubGlobal('fetch', mockFetch)

      const gptSuccess = await service.setGptWeights('K:/models/test.ckpt')
      expect(gptSuccess).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:9880/set_gpt_weights?weights_path=' +
          encodeURIComponent('K:/models/test.ckpt')
      )

      const sovitsSuccess = await service.setSovitsWeights('K:/models/test.pth')
      expect(sovitsSuccess).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:9880/set_sovits_weights?weights_path=' +
          encodeURIComponent('K:/models/test.pth')
      )
    })
  })

  describe('AudioTachieQueue (Sequential Dispatch, Prefetch & Abort)', () => {
    let memFs: MemoryFileSystem
    let service: GptSovitsService

    beforeEach(() => {
      memFs = new MemoryFileSystem()
      service = new GptSovitsService(memFs, { enabled: true })
      service.setMoodEntry('neutral', {
        audioPath: 'K:/ref.wav',
        promptText: 'test',
        promptLang: 'ja'
      })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should prefetch next segment, play sequentially, and trigger tachie/bubble synchronization', async () => {
      const synthesizedTexts: string[] = []
      const startedSegments: string[] = []
      const endedSegments: string[] = []

      // 模拟 synthesize 方法
      vi.spyOn(service, 'synthesize').mockImplementation(async (opts) => {
        synthesizedTexts.push(opts.text)
        return {
          success: true,
          audioBuffer: new Uint8Array([1, 2, 3]),
          audioUrl: `blob:${opts.text}`
        }
      })

      // 模拟短耗时播放器
      const fastPlayer = new SimulatedAudioPlayer(10)

      const queue = new AudioTachieQueue(service, fastPlayer, {
        onSegmentStart: (seg) => startedSegments.push(seg.text),
        onSegmentEnd: (seg) => endedSegments.push(seg.text)
      })

      const segments = [
        { text: '第一句', rawText: '第一句', mood: 'neutral' as const, tachie: '正常' as const },
        { text: '第二句', rawText: '第二句', mood: 'happiness' as const, tachie: '开心' as const }
      ]

      await queue.enqueue(segments)

      // 等待队列消费完毕
      await new Promise((r) => setTimeout(r, 1200))

      // 验证顺序触发
      expect(startedSegments).toEqual(['第一句', '第二句'])
      expect(endedSegments).toEqual(['第一句', '第二句'])
      expect(synthesizedTexts).toContain('第一句')
      expect(synthesizedTexts).toContain('第二句')
    })

    it('should immediately stop and clear queue when abort() is called', async () => {
      let abortedCalled = false
      const started: string[] = []

      vi.spyOn(service, 'synthesize').mockResolvedValue({
        success: true,
        audioBuffer: new Uint8Array([1, 2, 3])
      })

      const longPlayer = new SimulatedAudioPlayer(1000)
      const queue = new AudioTachieQueue(service, longPlayer, {
        onSegmentStart: (seg) => started.push(seg.text),
        onAbort: () => {
          abortedCalled = true
        }
      })

      const segments = [
        { text: '第一句长文本', rawText: '第一句长文本', mood: 'neutral' as const, tachie: '正常' as const },
        { text: '第二句长文本', rawText: '第二句长文本', mood: 'teasing' as const, tachie: '坏笑' as const }
      ]

      void queue.enqueue(segments)
      // 稍等第一句启动
      await new Promise((r) => setTimeout(r, 50))
      expect(queue.getIsRunning()).toBe(true)

      // 立即打断
      queue.abort()

      expect(queue.getIsRunning()).toBe(false)
      expect(abortedCalled).toBe(true)
    })
  })

  describe('Alpha Pixel Hit-Testing (Desktop Pet Click-Through)', () => {
    it('should correctly determine interactive vs transparent pixel based on threshold 50', () => {
      // alpha <= 50 -> 透明区域（穿透）
      expect(isInteractivePixel(0)).toBe(false)
      expect(isInteractivePixel(25)).toBe(false)
      expect(isInteractivePixel(50)).toBe(false)

      // alpha > 50 -> 不透明立绘实体（捕获）
      expect(isInteractivePixel(51)).toBe(true)
      expect(isInteractivePixel(128)).toBe(true)
      expect(isInteractivePixel(255)).toBe(true)
    })

    it('should ignore mouse only when alpha <= 50 AND user is NOT hovering UI elements', () => {
      // 场景 1: 鼠标在完全透明区域，未悬停 UI -> 穿透底层窗口
      expect(shouldIgnoreMouse(0, false)).toBe(true)
      expect(shouldIgnoreMouse(45, false)).toBe(true)

      // 场景 2: 鼠标在透明区域，但正在台词气泡或输入框上 -> 必须捕获，不穿透！
      expect(shouldIgnoreMouse(0, true)).toBe(false)
      expect(shouldIgnoreMouse(30, true)).toBe(false)

      // 场景 3: 鼠标在立绘实体区域 (alpha > 50) -> 捕获鼠标，允许点击与拖拽
      expect(shouldIgnoreMouse(100, false)).toBe(false)
      expect(shouldIgnoreMouse(255, false)).toBe(false)
      expect(shouldIgnoreMouse(255, true)).toBe(false)
    })
  })
})
