import { describe, it, expect, vi } from 'vitest'
import {
  stripSpeechTags,
  parseSpeechSegments,
  AudioTachieQueue,
  SimulatedAudioPlayer,
  VoiceInputController,
  categorizeWindow,
  filterSensitiveTitle,
  formatDesktopContextPrompt
} from '../index.shared'
import { SystemPromptBuilder } from '@baishou/ai'

describe('BanXia Phase 4: Dialogue-TTS-Pet Pipeline, Desktop Perception & Anti-Echo Lock', () => {
  // =========================================================================
  // 1. 全链路对话与情绪语音队列 + 纯净落盘脱壳验证
  // =========================================================================
  describe('Task 4.1: Speech Tag Stripping & AudioTachieQueue End-to-End', () => {
    it('1.1 严格剥除情绪立绘标签，确保落库与UI展示 100% 纯净（零污染铁律）', () => {
      const rawLLMOutput =
        '[坏笑] 你在写什么，看不懂。[正常] 过来，脸上沾了点灰，帮你擦掉。[开心] 好了，继续写吧。'

      const cleanText = stripSpeechTags(rawLLMOutput)

      // 必须彻底剔除 [坏笑]、[正常]、[开心]
      expect(cleanText).not.toContain('[坏笑]')
      expect(cleanText).not.toContain('[正常]')
      expect(cleanText).not.toContain('[开心]')
      expect(cleanText).toContain('你在写什么，看不懂。')
      expect(cleanText).toContain('过来，脸上沾了点灰，帮你擦掉。')
      expect(cleanText).toContain('好了，继续写吧。')

      // 测试复杂扩展标签格式
      const rawWithExtendedTags =
        '[mood:teasing|tachie:坏笑]某人不好好码字，又跑来偷看我。[mood:shy|tachie:害羞]看什么看……'
      const cleanExtended = stripSpeechTags(rawWithExtendedTags)
      expect(cleanExtended).not.toContain('mood:')
      expect(cleanExtended).not.toContain('tachie:')
      expect(cleanExtended).toBe('某人不好好码字，又跑来偷看我。看什么看……')
    })

    it('1.2 准确切分分段语音，保持情绪立绘与台词严格映射', () => {
      const rawText =
        '[坏笑] 你在写什么，看不懂。[害羞] 过来，脸上沾了点灰。[生气] 不许乱动！'

      const segments = parseSpeechSegments(rawText)
      expect(segments).toHaveLength(3)

      expect(segments[0]!.tachie).toBe('坏笑')
      expect(segments[0]!.mood).toBe('teasing')
      expect(segments[0]!.text).toBe('你在写什么，看不懂。')

      expect(segments[1]!.tachie).toBe('害羞')
      expect(segments[1]!.mood).toBe('shy')
      expect(segments[1]!.text).toBe('过来，脸上沾了点灰。')

      expect(segments[2]!.tachie).toBe('生气')
      expect(segments[2]!.mood).toBe('anger')
      expect(segments[2]!.text).toBe('不许乱动！')
    })

    it('1.3 AudioTachieQueue 串行播放与说话状态同步通知', async () => {
      const startedTachies: string[] = []
      const speakingStates: boolean[] = []

      const mockTtsService = {
        synthesize: vi.fn().mockImplementation(async (_opts) => ({
          success: true,
          audioBuffer: new Uint8Array([1, 2, 3]),
          audioUrl: 'blob:mock-audio',
          durationMs: 10
        }))
      }

      const player = new SimulatedAudioPlayer(10)
      const queue = new AudioTachieQueue(mockTtsService, player)

      const queuePromise = new Promise<void>((resolve) => {
        queue.setEvents({
          onSegmentStart: (seg) => {
            startedTachies.push(seg.tachie)
          },
          onSpeakingStateChange: (speaking) => {
            speakingStates.push(speaking)
          },
          onQueueComplete: () => {
            resolve()
          }
        })
      })

      const segments = parseSpeechSegments(
        '[坏笑] 某人今天挺勤奋。[正常] 继续保持。'
      )
      await queue.enqueue(segments)
      await queuePromise

      // 验证表情依次按序起播
      expect(startedTachies).toEqual(['坏笑', '正常'])
      // 验证说话状态流转：开始为 true，结束后为 false
      expect(speakingStates[0]).toBe(true)
      expect(speakingStates[speakingStates.length - 1]).toBe(false)
      expect(queue.isSpeaking()).toBe(false)
    })
  })

  // =========================================================================
  // 2. 桌面环境感知（窗口语义分类、隐私脱敏过滤与 System Prompt 注入）
  // =========================================================================
  describe('Task 4.2: Desktop Perception & Prompt Injection', () => {
    it('2.1 活动窗口语义分类感知（写作、绘画、游戏、浏览与通用）', () => {
      // 1. 写作 / 码字
      const writingWin = categorizeWindow('Code.exe', '笨蛋一生.md - Obsidian v1.5')
      expect(writingWin.category).toBe('writing')
      expect(writingWin.description).toContain('正在码字写稿或编辑文档《笨蛋一生.md》')

      // 2. 绘画
      const artWin = categorizeWindow('ClipStudioPaint.exe', 'banxia_color.clip')
      expect(artWin.category).toBe('art')
      expect(artWin.description).toContain('正在使用绘图软件或查看画作插画')

      // 3. 游戏
      const gameWin = categorizeWindow('ZenlessZoneZero.exe', '绝区零')
      expect(gameWin.category).toBe('gaming')
      expect(gameWin.description).toContain('正在运行游戏《绝区零》')

      // 4. 浏览
      const browseWin = categorizeWindow('chrome.exe', '村田莲尔画集赏析 - 哔哩哔哩')
      expect(browseWin.category).toBe('browsing')
      expect(browseWin.description).toContain('正在浏览网页或视频《村田莲尔画集赏析》')
    })

    it('2.2 敏感隐私窗口标题自动脱敏脱敏过滤', () => {
      const passwordWin = categorizeWindow('chrome.exe', '1Password - Vault - Personal')
      expect(passwordWin.windowTitle).toBe('私密浏览 / 安全窗口')

      const bankWin = filterSensitiveTitle('招商银行 个人网银登录 - Edge')
      expect(bankWin).toBe('私密浏览 / 安全窗口')

      const normalWin = filterSensitiveTitle('关于“她”的随笔草稿.txt')
      expect(normalWin).toBe('关于“她”的随笔草稿.txt')
    })

    it('2.3 桌面感知上下文与轻量情绪协议正确注入 System Prompt', () => {
      const activeWin = categorizeWindow('WINWORD.EXE', '无意识 - 小说正文.docx')
      const desktopPrompt = formatDesktopContextPrompt(activeWin)
      expect(desktopPrompt).toBe('当前桌面活动状态：正在码字写稿或编辑文档《无意识》')

      const fullPrompt = SystemPromptBuilder.build({
        vaultName: 'BanXiaVault',
        tools: {},
        desktopContext: desktopPrompt
      })

      // 必须包含 <desktop_context> 且禁止机械复读
      expect(fullPrompt).toContain('<desktop_context>')
      expect(fullPrompt).toContain('当前桌面活动状态：正在码字写稿或编辑文档《无意识》')
      expect(fullPrompt).toContain('严禁机械式每句话都复读或播报窗口标题')
      expect(fullPrompt).toContain('</desktop_context>')

      // 必须包含 <expression_protocol> 规范
      expect(fullPrompt).toContain('<expression_protocol>')
      expect(fullPrompt).toContain('[正常]、[开心]、[害羞]、[生气]、[难过]、[坏笑]')
      expect(fullPrompt).toContain('系统会在入库与展示前自动剥离标记，保持聊天记录纯净')
      expect(fullPrompt).toContain('</expression_protocol>')
    })
  })

  // =========================================================================
  // 3. 语音对讲防回声互斥锁与瞬间抢断（PTT & Anti-Echo Mutex Lock）
  // =========================================================================
  describe('Task 4.3: Push-to-Talk & Anti-Echo Mutex Lock', () => {
    it('3.1 半夏说话时自动锁定麦克风，阻止自激回声', () => {
      let stateChangedTo = ''
      let errorTriggered: any = null

      const controller = new VoiceInputController({
        onStateChange: (state) => {
          stateChangedTo = state
        },
        onError: (err) => {
          errorTriggered = err
        }
      })

      expect(controller.getState()).toBe('idle')
      expect(controller.isLocked()).toBe(false)

      // 半夏开始播放语音 -> 互斥锁生效
      controller.setSpeakingLock(true)
      expect(controller.isLocked()).toBe(true)
      expect(stateChangedTo).toBe('locked')

      // 在锁定状态下尝试录音（不抢断）
      const recordSuccess = controller.startRecording({ forceBargeIn: false })
      expect(recordSuccess).toBe(false)
      expect(errorTriggered).toBeDefined()
      expect(errorTriggered.message).toContain('防回声互斥锁激活中')
      expect(controller.getState()).toBe('locked')

      // 半夏播放结束 -> 互斥锁自动解除
      controller.setSpeakingLock(false)
      expect(controller.isLocked()).toBe(false)
      expect(controller.getState()).toBe('idle')
    })

    it('3.2 用户强制抢断（Barge-in）立即打断播放并开始录音', () => {
      let bargeInTriggered = false
      let finalState = ''

      const controller = new VoiceInputController({
        onStateChange: (state) => {
          finalState = state
        },
        onBargeIn: () => {
          bargeInTriggered = true
        }
      })

      // 半夏正在说话
      controller.setSpeakingLock(true)
      expect(controller.isLocked()).toBe(true)

      // 用户点击对讲按钮强制打断 (forceBargeIn: true)
      const recordSuccess = controller.startRecording({ forceBargeIn: true })

      expect(bargeInTriggered).toBe(true)
      expect(recordSuccess).toBe(true)
      expect(controller.isLocked()).toBe(false)
      expect(finalState).toBe('recording')

      // 结束录音
      controller.stopRecording()
      expect(controller.getState()).toBe('idle')
    })
  })
})
