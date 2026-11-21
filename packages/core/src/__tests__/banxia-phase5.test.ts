import { describe, it, expect, vi } from 'vitest'
import {
  parseActiveWindow,
  formatDeltaDesktopContextPrompt,
  filterSensitiveTitle,
  stripSpeechTags,
  resolveFallbackTachie,
  StreamingSentenceBuffer,
  GptSovitsService,
  scanInferenceDirectory,
  type IFileSystem
} from '../index.shared'
import {
  SystemPromptBuilder,
  DiaryWriteTool,
  DiaryEditTool,
  runDiaryWriteViaDb,
  runDiaryEditViaDb,
  type ToolContext
} from '@baishou/ai'
import { BANXIA_CORE_PERSONA, HUNXIAOXIAO_USER_IDENTITY } from '@baishou/shared'

describe('BanXia Phase 5: Prompt Tuning Workbench, Essay Tooling, Dynamic Mood Pools, Streaming TTS & Perception', () => {
  // =========================================================================
  // 1. Task 5.1: 提示词调优工作台与四大模块动态装配
  // =========================================================================
  describe('Task 5.1: Prompt Tuning Workbench & System Prompt Assembly', () => {
    it('1.1 模块 A（人设覆盖）：自定义人设 100% 替换默认 920 字人设', () => {
      const customPersona = '你现在是半夏的沉浸模式，更加专注倾听与画作讨论。'
      const prompt = SystemPromptBuilder.build({
        vaultName: 'BanXiaVault',
        tools: {},
        customPersona
      })

      expect(prompt).toContain('<assistant_persona>')
      expect(prompt).toContain(customPersona)
      // 必须完全替换默认长人设
      expect(prompt).not.toContain(BANXIA_CORE_PERSONA)
      expect(prompt).toContain('</assistant_persona>')
    })

    it('1.2 模块 B（用户卡覆盖）：自定义用户身份 100% 替换默认卡片', () => {
      const customIdentity = '用户名为小小，当前正在创作新的奇幻长篇。'
      const prompt = SystemPromptBuilder.build({
        vaultName: 'BanXiaVault',
        tools: {},
        userIdentityPrompt: customIdentity
      })

      expect(prompt).toContain('<user_identity>')
      expect(prompt).toContain(customIdentity)
      expect(prompt).not.toContain(HUNXIAOXIAO_USER_IDENTITY)
      expect(prompt).toContain('</user_identity>')
    })

    it('1.3 模块 C（准则覆盖）：注入自定义陪伴与工具调用准则', () => {
      const customGuidelines = '半夏在完成对话后，若感受到有意义的灵感，应主动调用 diary_write 记录随笔。'
      const prompt = SystemPromptBuilder.build({
        vaultName: 'BanXiaVault',
        tools: {},
        companionAndToolPrompt: customGuidelines
      })

      expect(prompt).toContain('<companion_guidelines>')
      expect(prompt).toContain(customGuidelines)
      expect(prompt).toContain('</companion_guidelines>')
    })

    it('1.4 模块 D（输出协议模板）：支持动态注入 {{AVAILABLE_MOODS}} 情绪列表', () => {
      const availableMoods = ['正常', '开心', '温柔', '沉思', '调侃']
      const customTemplate = '请在句子开头标明心境：{{AVAILABLE_MOODS}}，表达必须自然。'
      const prompt = SystemPromptBuilder.build({
        vaultName: 'BanXiaVault',
        tools: {},
        expressionProtocolTemplate: customTemplate,
        availableMoods
      })

      expect(prompt).toContain('<expression_protocol>')
      expect(prompt).toContain('[正常]、[开心]、[温柔]、[沉思]、[调侃]')
      expect(prompt).not.toContain('{{AVAILABLE_MOODS}}')
      expect(prompt).toContain('</expression_protocol>')
    })

    it('1.5 默认值兜底：未填写任何覆盖项时完整保留系统内置默认人设与协议', () => {
      const defaultPrompt = SystemPromptBuilder.build({
        vaultName: 'BanXiaVault',
        tools: {}
      })

      expect(defaultPrompt).toContain(BANXIA_CORE_PERSONA)
      expect(defaultPrompt).toContain(HUNXIAOXIAO_USER_IDENTITY)
      expect(defaultPrompt).toContain('[正常]、[开心]、[害羞]、[生气]、[难过]、[坏笑]')
    })
  })

  // =========================================================================
  // 2. Task 5.2: 升级 diary_write 与 diary_edit 工具支持随笔与小说档案
  // =========================================================================
  describe('Task 5.2: Upgrade diary_write & diary_edit for banxia_essay & novel_archive', () => {
    it('2.1 diary_write 工具 Schema 包含 entryType（默认 banxia_essay）与 title', () => {
      const writeTool = new DiaryWriteTool()
      expect(writeTool.name).toBe('diary_write')

      // 验证默认 entryType 解析为 banxia_essay
      const parsed = writeTool.parameters.parse({
        date: '2026-11-21',
        content: '今天在画室调了很久的钴蓝。'
      })
      expect(parsed.entryType).toBe('banxia_essay')

      // 验证显式传入 novel_archive 与 title
      const novelParsed = writeTool.parameters.parse({
        date: '2026-11-21',
        content: '小说第一章正文...',
        entryType: 'novel_archive',
        title: '新小说稿件'
      })
      expect(novelParsed.entryType).toBe('novel_archive')
      expect(novelParsed.title).toBe('新小说稿件')
    })

    it('2.2 runDiaryWriteViaDb 正确透传 entryType 与 title 到存储层', async () => {
      const mockWriteEntry = vi.fn().mockResolvedValue({ ok: true })
      const mockContext: ToolContext = {
        sessionId: 'session-123',
        vaultId: 'vlt-test',
        vaultName: 'BanXiaVault',
        diarySearcher: {
          writeEntry: mockWriteEntry
        } as any
      }

      const res = await runDiaryWriteViaDb(
        {
          date: '2026-11-21',
          content: '第一人称随笔正文',
          entryType: 'banxia_essay',
          title: '关于画室的阳光'
        },
        mockContext
      )

      expect(mockWriteEntry).toHaveBeenCalledWith('2026-11-21', '第一人称随笔正文', {
        entryType: 'banxia_essay',
        title: '关于画室的阳光'
      })
      expect(res).toContain('Successfully created BanXia essay "关于画室的阳光"')
    })

    it('2.3 diary_edit 工具 Schema 兼容 entryType 与 title 修改', () => {
      const editTool = new DiaryEditTool()
      expect(editTool.name).toBe('diary_edit')

      const parsed = editTool.parameters.parse({
        date: '2026-11-21',
        content: '追加一段读后感',
        entryType: 'banxia_essay',
        title: '修改后的标题'
      })
      expect(parsed.entryType).toBe('banxia_essay')
      expect(parsed.title).toBe('修改后的标题')
      expect(parsed.mode).toBe('append')
    })

    it('2.4 runDiaryEditViaDb 正确透传 entryType 与 title 到存储层', async () => {
      const mockEditEntry = vi.fn().mockResolvedValue({ ok: true })
      const mockContext: ToolContext = {
        sessionId: 'session-123',
        vaultId: 'vlt-test',
        vaultName: 'BanXiaVault',
        diarySearcher: {
          editEntry: mockEditEntry
        } as any
      }

      const res = await runDiaryEditViaDb(
        {
          date: '2026-11-21',
          content: '追加内容',
          mode: 'append',
          entryType: 'banxia_essay',
          title: '随笔新标题'
        },
        mockContext
      )

      expect(mockEditEntry).toHaveBeenCalledWith({
        date: '2026-11-21',
        content: '追加内容',
        mode: 'append',
        entryType: 'banxia_essay',
        title: '随笔新标题'
      })
      expect(res).toContain('Successfully appended content to the diary entry')
    })
  })

  // =========================================================================
  // 3. Task 5.3: 动态情绪池扫描、随机选取与立绘解耦智能兜底
  // =========================================================================
  describe('Task 5.3: Dynamic GPT-SoVITS Emotion Pool & Multi-Audio Random Pick', () => {
    it('3.1 目录扫描器正确提取自定义情绪标签（【温柔】、【沉思】）并聚合为情绪池', async () => {
      const mockFs: IFileSystem = {
        exists: vi.fn().mockResolvedValue(true),
        readdir: vi.fn().mockImplementation(async (dir: string) => {
          if (dir === 'K:/models') {
            return ['banxia.ckpt', 'banxia.pth', '【温柔】台词1.wav', '【温柔】台词2.wav', '【沉思】台词.wav']
          }
          return []
        }),
        stat: vi.fn().mockImplementation(async (p: string) => ({
          isFile: !p.endsWith('/'),
          isDirectory: false
        })),
        readFile: vi.fn().mockRejectedValue(new Error('no json'))
      } as any

      const result = await scanInferenceDirectory('K:/models', mockFs)

      expect(result.gptWeights.map((p) => p.replace(/\\/g, '/'))).toContain('K:/models/banxia.ckpt')
      expect(result.sovitsWeights.map((p) => p.replace(/\\/g, '/'))).toContain('K:/models/banxia.pth')
      expect(result.moodPools['温柔']).toHaveLength(2)
      expect(result.moodPools['沉思']).toHaveLength(1)
      expect(result.availableMoods).toContain('温柔')
      expect(result.availableMoods).toContain('沉思')
    })

    it('3.2 GptSovitsService 支持从多音频情绪池中随机抽选', () => {
      const mockFs = { exists: vi.fn().mockResolvedValue(true) } as any
      const service = new GptSovitsService(mockFs)

      service.setMoodPool('温柔', [
        { audioPath: 'K:/voices/gentle_1.wav', promptText: '台词1', promptLang: 'ja' },
        { audioPath: 'K:/voices/gentle_2.wav', promptText: '台词2', promptLang: 'ja' },
        { audioPath: 'K:/voices/gentle_3.wav', promptText: '台词3', promptLang: 'ja' }
      ])

      const pools = service.getMoodPools()
      expect(pools['温柔']).toHaveLength(3)
      expect(service.getAvailableMoods()).toContain('温柔')
    })

    it('3.3 立绘与声音情绪解耦：自定义情绪智能兜底到 6 款基础立绘', () => {
      expect(resolveFallbackTachie('温柔')).toBe('正常')
      expect(resolveFallbackTachie('沉思')).toBe('正常')
      expect(resolveFallbackTachie('兴奋')).toBe('开心')
      expect(resolveFallbackTachie('得意')).toBe('开心')
      expect(resolveFallbackTachie('脸红')).toBe('害羞')
      expect(resolveFallbackTachie('愤怒')).toBe('生气')
      expect(resolveFallbackTachie('沮丧')).toBe('难过')
      expect(resolveFallbackTachie('调侃')).toBe('坏笑')
      expect(resolveFallbackTachie('未知奇特情绪')).toBe('正常')
    })

    it('3.4 纯净脱壳：stripSpeechTags 剥除任意情绪标签且保护 Markdown 链接不受影响', () => {
      const rawText = '[温柔] 天气冷了，多穿件衣服。[沉思] 这段情节逻辑可能还要推敲一下。'
      const clean = stripSpeechTags(rawText)
      expect(clean).toBe('天气冷了，多穿件衣服。 这段情节逻辑可能还要推敲一下。')

      // 验证 Markdown 链接语法 [text](url) 不被剥离
      const mdText = '可以参考我的小说档案 [《无意识》](file:///Novels/wuyishi.md) 里的设定。'
      const cleanMd = stripSpeechTags(mdText)
      expect(cleanMd).toBe('可以参考我的小说档案 [《无意识》](file:///Novels/wuyishi.md) 里的设定。')
    })
  })

  // =========================================================================
  // 4. Task 5.4: 流式切句缓存器 (StreamingSentenceBuffer) 验证
  // =========================================================================
  describe('Task 5.4: Streaming Sentence Buffer (Instant TTS)', () => {
    it('4.1 收到句末标点时立即吐出单句，消除等待；flush() 吐出尾巴', () => {
      const emittedSentences: string[] = []
      const buffer = new StreamingSentenceBuffer({
        onSentence: (seg) => {
          emittedSentences.push(seg.text)
        }
      })

      // 模拟 SSE 流式字符片段到达
      buffer.append('[坏笑] 你在写')
      expect(emittedSentences).toHaveLength(0) // 未遇标点，不触发

      buffer.append('什么，看不懂。')
      // 遇到句号，立即吐出第一句
      expect(emittedSentences).toEqual(['你在写什么，看不懂。'])

      buffer.append('[正常] 过来，脸上沾了点灰！')
      // 遇到感叹号，吐出第二句
      expect(emittedSentences).toEqual(['你在写什么，看不懂。', '过来，脸上沾了点灰！'])

      // 剩余无标点的尾巴
      buffer.append('好了，继续吧')
      expect(emittedSentences).toHaveLength(2)

      // 流结束 flush
      buffer.flush()
      expect(emittedSentences).toEqual([
        '你在写什么，看不懂。',
        '过来，脸上沾了点灰！',
        '好了，继续吧'
      ])
    })

    it('4.2 跨流保持情绪状态并正确关联立绘表情', () => {
      const emittedMoods: string[] = []
      const emittedTachies: string[] = []

      const buffer = new StreamingSentenceBuffer({
        onSentence: (seg) => {
          emittedMoods.push(seg.mood)
          emittedTachies.push(seg.tachie)
        }
      })

      buffer.append('[坏笑] 某人今天挺勤奋。')
      buffer.append('继续保持。')
      buffer.flush()

      expect(emittedMoods[0]).toBe('teasing')
      expect(emittedTachies[0]).toBe('坏笑')
      // 第二句承接上一句的坏笑状态
      expect(emittedMoods[1]).toBe('teasing')
      expect(emittedTachies[1]).toBe('坏笑')
    })
  })

  // =========================================================================
  // 5. Task 5.5: 原汁原味窗口感知与增量控制 (Delta-only)
  // =========================================================================
  describe('Task 5.5: De-categorized Desktop Perception (Delta-only)', () => {
    it('5.1 parseActiveWindow 原汁原味解析进程与窗口标题，不再硬编码分类', () => {
      const win = parseActiveWindow('Blender.exe', 'Character_Model_v2.blend - Blender 4.2')
      expect(win.processName).toBe('Blender.exe')
      expect(win.windowTitle).toBe('Character_Model_v2.blend - Blender 4.2')
      expect(win.description).toBe('[Blender] Character_Model_v2.blend - Blender 4.2')

      const prompt = formatDeltaDesktopContextPrompt(win)
      expect(prompt).toBe(
        '[环境感知：魂小小当前的桌面窗口切换为「Character_Model_v2.blend - Blender 4.2」（进程：Blender）]'
      )
    })

    it('5.2 敏感隐私窗口标题自动脱敏', () => {
      const win = parseActiveWindow('chrome.exe', 'Bitwarden - Vault - Google Chrome')
      expect(win.windowTitle).toBe('私密浏览 / 安全窗口')
      expect(filterSensitiveTitle('招商银行 个人网银')).toBe('私密浏览 / 安全窗口')
    })
  })
})
