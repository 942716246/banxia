import {
  parseSpeechSegments,
  type SpeechSegment,
  stripSpeechTags,
  type BanXiaMood,
  type BanXiaTachie
} from './speech-segment.parser'

export interface StreamingSentenceBufferOptions {
  onSentence: (segment: SpeechSegment) => void
  minSentenceLength?: number
}

/**
 * 流式短句缓存器 (StreamingSentenceBuffer)
 *
 * 1. 随着大模型 SSE 流式输出 delta，逐步追加文本；
 * 2. 匹配句末标点（。！？!?…\n），当纯文本长度 >= 2 时立即吐出切片并触发 onSentence 回调；
 * 3. 跨流维持情绪与立绘状态（上一句若有情绪标记，下一句默认承接，直到遇到新标记）；
 * 4. 大模型流结束（sendFinish）时调用 flush()，将尾巴残余文本作为最终句吐出。
 */
export class StreamingSentenceBuffer {
  private buffer = ''
  private currentMood: BanXiaMood = 'neutral'
  private currentTachie: BanXiaTachie = '正常'
  private minSentenceLength: number

  constructor(private readonly options: StreamingSentenceBufferOptions) {
    this.minSentenceLength = options.minSentenceLength ?? 2
  }

  public append(chunk: string): void {
    if (!chunk) return
    this.buffer += chunk
    this.processBuffer(false)
  }

  public flush(): void {
    this.processBuffer(true)
  }

  public reset(): void {
    this.buffer = ''
    this.currentMood = 'neutral'
    this.currentTachie = '正常'
  }

  public getCurrentMood(): BanXiaMood {
    return this.currentMood
  }

  public getCurrentTachie(): BanXiaTachie {
    return this.currentTachie
  }

  private processBuffer(isFlush: boolean): void {
    // 句末分割正则：匹配一段文字直到标点符号（包括标点自身）
    // 标点包括：。 ！？ ! ? … \n
    const delimiterRegex = /([^。！？!?\n…]+[。！？!?\n…]+)/g
    let lastIndex = 0
    let match: RegExpExecArray | null

      while ((match = delimiterRegex.exec(this.buffer)) !== null) {
      const rawChunk = match[1]!
      const clean = stripSpeechTags(rawChunk).trim()
      if (clean.length >= this.minSentenceLength) {
        const segments = parseSpeechSegments(rawChunk)
        for (const seg of segments) {
          if (seg.text.trim().length > 0) {
            const hasTag = /\[\s*[\w\u4e00-\u9fa5:|]+\s*\](?!\()|【\s*[\w\u4e00-\u9fa5:|]+\s*】|\(\s*[\w\u4e00-\u9fa5]+\s*\)/.test(
              seg.rawText
            )
            if (hasTag || seg.mood !== 'neutral' || seg.tachie !== '正常') {
              this.currentMood = seg.mood
              this.currentTachie = seg.tachie
            } else {
              seg.mood = this.currentMood
              seg.tachie = this.currentTachie
            }
            this.options.onSentence(seg)
          }
        }
      }
      lastIndex = delimiterRegex.lastIndex
    }

    if (lastIndex > 0) {
      this.buffer = this.buffer.slice(lastIndex)
    }

    if (isFlush && this.buffer.trim().length > 0) {
      const clean = stripSpeechTags(this.buffer).trim()
      if (clean.length > 0) {
        const segments = parseSpeechSegments(this.buffer)
        for (const seg of segments) {
          if (seg.text.trim().length > 0) {
            const hasTag = /\[\s*[\w\u4e00-\u9fa5:|]+\s*\](?!\()|【\s*[\w\u4e00-\u9fa5:|]+\s*】|\(\s*[\w\u4e00-\u9fa5]+\s*\)/.test(
              seg.rawText
            )
            if (hasTag || seg.mood !== 'neutral' || seg.tachie !== '正常') {
              this.currentMood = seg.mood
              this.currentTachie = seg.tachie
            } else {
              seg.mood = this.currentMood
              seg.tachie = this.currentTachie
            }
            this.options.onSentence(seg)
          }
        }
      }
      this.buffer = ''
    }
  }
}
