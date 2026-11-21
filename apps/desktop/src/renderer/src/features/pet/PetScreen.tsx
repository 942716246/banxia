import React, { useEffect, useState, useRef, useCallback } from 'react'
import type { BanXiaTachie, SpeechSegment, VoiceInputState } from '@baishou/shared'
import {
  parseSpeechSegments,
  AudioTachieQueue,
  type IAudioPlayer,
  SimulatedAudioPlayer,
  VoiceInputController
} from '@baishou/shared'
import { PetCanvas } from './PetCanvas'
import { PetBubble } from './PetBubble'
import { PetContextMenu } from './PetContextMenu'
import { PetQuickInput } from './PetQuickInput'

/**
 * 浏览器端真实音频播放器（包装 HTML5 Audio）
 */
class BrowserAudioPlayer implements IAudioPlayer {
  private currentAudio: HTMLAudioElement | null = null
  private objectUrl: string | null = null

  public async play(audioBuffer: Uint8Array, audioUrl?: string): Promise<void> {
    return new Promise((resolve) => {
      this.stop()

      let src = audioUrl
      if (audioBuffer && audioBuffer.length > 0) {
        const blob = new Blob([audioBuffer as unknown as BlobPart], { type: 'audio/wav' })
        this.objectUrl = URL.createObjectURL(blob)
        src = this.objectUrl
      }

      if (!src) {
        resolve()
        return
      }

      const audio = new Audio(src)
      this.currentAudio = audio

      audio.onended = () => {
        this.stop()
        resolve()
      }

      audio.onerror = () => {
        this.stop()
        resolve()
      }

      audio.play().catch(() => {
        this.stop()
        resolve()
      })
    })
  }

  public stop(): void {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause()
        this.currentAudio.currentTime = 0
      } catch {
        // ignore
      }
      this.currentAudio = null
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
  }
}

export const PetScreen: React.FC = () => {
  const [tachie, setTachie] = useState<BanXiaTachie>('正常')
  const [bubbleText, setBubbleText] = useState('')
  const [bubbleVisible, setBubbleVisible] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [scale, setScale] = useState(1.0)
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [perceptionEnabled, setPerceptionEnabled] = useState(true)
  const [tachieDir, setTachieDir] = useState('')
  const [voiceState, setVoiceState] = useState<VoiceInputState>('idle')

  // UI 悬停状态（悬停在气泡、输入框或菜单上时绝对不穿透底层窗口）
  const [isUiHovered, setIsUiHovered] = useState(false)
  const [quickInputVisible, setQuickInputVisible] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null)

  const queueRef = useRef<AudioTachieQueue | null>(null)
  const voiceControllerRef = useRef<VoiceInputController | null>(null)
  const bubbleDismissTimerRef = useRef<any>(null)

  // 1. 设置根容器透明样式
  useEffect(() => {
    document.documentElement.style.backgroundColor = 'transparent'
    document.body.style.backgroundColor = 'transparent'
    const root = document.getElementById('root')
    if (root) {
      root.style.backgroundColor = 'transparent'
      root.style.height = '100%'
      root.style.width = '100%'
      root.style.overflow = 'hidden'
    }
  }, [])

  // 2. 说话处理逻辑
  const speakText = useCallback((raw: string) => {
    if (bubbleDismissTimerRef.current) {
      clearTimeout(bubbleDismissTimerRef.current)
      bubbleDismissTimerRef.current = null
    }
    const segments = parseSpeechSegments(raw)
    void queueRef.current?.enqueue(segments)
  }, [])

  // 3. 快捷搭话处理逻辑（优先调用主进程 LLM，离线/失败时自动回退拟真互动）
  const handleQuickSend = useCallback(
    async (input: string) => {
      let chatSuccess = false
      try {
        if (window.api?.pet?.chat) {
          chatSuccess = await window.api.pet.chat({ text: input })
        }
      } catch {
        chatSuccess = false
      }

      if (!chatSuccess) {
        const teasingReplies = [
          '[mood:teasing|tachie:坏笑]某人不好好码字写小说，怎么又跑来找我闲聊了？',
          '[mood:happiness|tachie:开心]今天刚把森薰的刺绣花纹画完一小撮，感觉手腕都不是自己的了。',
          '[mood:shy|tachie:害羞]干嘛突然这么一本正经地搭话……吓我一跳。',
          '[mood:neutral|tachie:正常]在呢。画室今天稀释剂味稍微有点浓，我正开着窗通风呢。'
        ]
        const randomReply = teasingReplies[Math.floor(Math.random() * teasingReplies.length)]
        speakText(randomReply)
      }
    },
    [speakText]
  )

  // 4. 初始化队列、语音控制器与读取配置
  useEffect(() => {
    void window.api?.pet?.getConfig().then((cfg: any) => {
      if (cfg) {
        if (typeof cfg.scale === 'number') setScale(cfg.scale)
        if (typeof cfg.ttsEnabled === 'boolean') setTtsEnabled(cfg.ttsEnabled)
        if (typeof cfg.tachieDir === 'string') setTachieDir(cfg.tachieDir)
      }
    })

    void window.api?.pet?.getWindowPerception?.().then((enabled: boolean) => {
      if (typeof enabled === 'boolean') setPerceptionEnabled(enabled)
    })

    // 初始化语音对讲控制器（带硬核防回声互斥锁与 Barge-in 抢断）
    const voiceCtrl = new VoiceInputController({
      onStateChange: (st) => setVoiceState(st),
      onTranscript: (transcript, isFinal) => {
        if (isFinal && transcript.trim()) {
          void handleQuickSend(transcript.trim())
        }
      },
      onBargeIn: () => {
        queueRef.current?.abort()
      }
    })
    voiceControllerRef.current = voiceCtrl

    // 构建 TTS 服务桥接
    const ttsBridge: any = {
      synthesize: async (opts: any) => {
        try {
          const res = await window.api?.tts?.synthesize?.(opts)
          return res || { success: false, offline: true }
        } catch {
          return { success: false, offline: true }
        }
      }
    }

    const player =
      typeof Audio !== 'undefined' ? new BrowserAudioPlayer() : new SimulatedAudioPlayer()

    const queue = new AudioTachieQueue(ttsBridge, player, {
      onSegmentStart: (seg, audioBuffer, audioUrl) => {
        setTachie(seg.tachie)
        setBubbleText(seg.text)
        setBubbleVisible(true)
        setIsSpeaking(true)
        voiceControllerRef.current?.setSpeakingLock(true)
        if (bubbleDismissTimerRef.current) {
          clearTimeout(bubbleDismissTimerRef.current)
          bubbleDismissTimerRef.current = null
        }
      },
      onSegmentEnd: () => {
        // 单句结束
      },
      onSpeakingStateChange: (speaking) => {
        setIsSpeaking(speaking)
        voiceControllerRef.current?.setSpeakingLock(speaking)
      },
      onQueueComplete: () => {
        setIsSpeaking(false)
        voiceControllerRef.current?.setSpeakingLock(false)
        bubbleDismissTimerRef.current = setTimeout(() => {
          setBubbleVisible(false)
          setTachie('正常')
        }, 2800)
      },
      onAbort: () => {
        setIsSpeaking(false)
        voiceControllerRef.current?.setSpeakingLock(false)
        setBubbleVisible(false)
        setTachie('正常')
      }
    })

    queueRef.current = queue

    // 监听全局说话指令（整段文本与流式切句）
    const unbindSpeak = window.api?.pet?.onSpeak((rawText: string) => {
      const segments = parseSpeechSegments(rawText)
      void queueRef.current?.enqueue(segments)
    })

    const unbindSpeakSegment = (window.api?.pet as any)?.onSpeakSegment?.(
      (segment: any) => {
        if (segment) {
          void queueRef.current?.enqueue([segment])
        }
      }
    )

    const unbindAbort = window.api?.pet?.onAbortSpeech(() => {
      queueRef.current?.abort()
    })

    const unbindScale = window.api?.pet?.onScaleChanged((newScale: number) => {
      setScale(newScale)
    })

    const unbindTachie = window.api?.pet?.onTachieDirChanged((dir: string) => {
      setTachieDir(dir)
    })

    return () => {
      unbindSpeak?.()
      unbindSpeakSegment?.()
      unbindAbort?.()
      unbindScale?.()
      unbindTachie?.()
      queueRef.current?.abort()
      voiceControllerRef.current?.abort()
    }
  }, [handleQuickSend])

  // 5. 屏幕截图感知
  const handleCaptureScreen = useCallback(async () => {
    try {
      const screen = await window.api?.pet?.captureScreen?.()
      if (screen?.dataUrl) {
        await window.api?.pet?.chat?.({
          text: '半夏，你看我现在的屏幕。',
          attachments: [
            {
              type: 'image',
              dataUrl: screen.dataUrl,
              name: screen.name || 'screenshot.png'
            }
          ]
        })
      }
    } catch {
      speakText('[mood:shy|tachie:害羞]屏幕截图获取失败了……你该不会正在看什么不可告人的东西吧？')
    }
  }, [speakText])

  // 6. 语音对讲切换
  const handleToggleVoice = useCallback(() => {
    if (voiceState === 'recording') {
      voiceControllerRef.current?.stopRecording()
    } else {
      voiceControllerRef.current?.startRecording({ forceBargeIn: true })
    }
  }, [voiceState])

  // 7. 桌面活动感知切换
  const handleTogglePerception = useCallback(() => {
    const next = !perceptionEnabled
    setPerceptionEnabled(next)
    void window.api?.pet?.setWindowPerception?.(next)
  }, [perceptionEnabled])

  // 8. 右键菜单交互
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsUiHovered(true)
    void window.api?.pet?.setIgnoreMouse(false)
    setContextMenuPos({ x: e.clientX, y: e.clientY })
  }

  const closeContextMenu = () => {
    setContextMenuPos(null)
    setIsUiHovered(false)
  }

  const handleToggleTts = () => {
    const next = !ttsEnabled
    setTtsEnabled(next)
    void window.api?.pet?.saveConfig({ ttsEnabled: next })
    void window.api?.tts?.updateConfig?.({ enabled: next })
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        backgroundColor: 'transparent',
        overflow: 'hidden'
      }}
      onClick={() => {
        if (contextMenuPos) closeContextMenu()
      }}
    >
      {/* 顶部台词气泡 */}
      <PetBubble
        text={bubbleText}
        visible={bubbleVisible}
        onMouseEnter={() => {
          setIsUiHovered(true)
          void window.api?.pet?.setIgnoreMouse(false)
        }}
        onMouseLeave={() => {
          setIsUiHovered(false)
        }}
      />

      {/* 立绘与 Alpha 穿透画布 */}
      <PetCanvas
        tachie={tachie}
        isSpeaking={isSpeaking}
        isUiHovered={isUiHovered || quickInputVisible || Boolean(contextMenuPos)}
        scale={scale}
        onContextMenu={handleContextMenu}
        onCharacterClick={() => {
          setQuickInputVisible((v) => !v)
        }}
      />

      {/* 底部快捷搭话小输入框 */}
      <PetQuickInput
        visible={quickInputVisible}
        isSpeaking={isSpeaking}
        voiceState={voiceState}
        onSend={handleQuickSend}
        onCaptureScreen={handleCaptureScreen}
        onToggleVoice={handleToggleVoice}
        onClose={() => {
          setQuickInputVisible(false)
          setIsUiHovered(false)
        }}
        onMouseEnter={() => {
          setIsUiHovered(true)
          void window.api?.pet?.setIgnoreMouse(false)
        }}
        onMouseLeave={() => {
          setIsUiHovered(false)
        }}
      />

      {/* 右键菜单 */}
      <PetContextMenu
        visible={Boolean(contextMenuPos)}
        x={contextMenuPos?.x ?? 0}
        y={contextMenuPos?.y ?? 0}
        ttsEnabled={ttsEnabled}
        perceptionEnabled={perceptionEnabled}
        currentScale={scale}
        onClose={closeContextMenu}
        onOpenMainWindow={() => {
          void window.api?.pet?.openMainWindow()
        }}
        onMuteInterrupt={() => {
          queueRef.current?.abort()
        }}
        onToggleTts={handleToggleTts}
        onTogglePerception={handleTogglePerception}
        onCaptureScreen={handleCaptureScreen}
        onSetScale={(newScale) => {
          setScale(newScale)
          void window.api?.pet?.setScale(newScale)
        }}
        onSelectInferenceDir={() => {
          void window.api?.pet?.selectInferenceDir()
        }}
        onSelectTachieDir={() => {
          void window.api?.pet?.selectTachieDir()
        }}
        onHidePet={() => {
          void window.api?.pet?.hide()
        }}
        onMouseEnter={() => {
          setIsUiHovered(true)
          void window.api?.pet?.setIgnoreMouse(false)
        }}
        onMouseLeave={() => {
          setIsUiHovered(false)
        }}
      />
    </div>
  )
}
