import React, { useState, useEffect, useCallback } from 'react'
import type { BanXiaMood, GptSovitsConfig, InferenceDirScanResult, VoiceMoodEntry } from '@baishou/shared'

const MOOD_LABELS: Record<BanXiaMood, { name: string; emoji: string }> = {
  neutral: { name: '正常 / 平静', emoji: '☕' },
  happiness: { name: '开心 / 得意', emoji: '✨' },
  teasing: { name: '坏笑 / 调侃', emoji: '😏' },
  shy: { name: '害羞 / 脸红', emoji: '😳' },
  anger: { name: '生气 / 严肃', emoji: '💢' },
  sadness: { name: '难过 / 沮丧', emoji: '💧' },
  fear: { name: '害怕 / 惊慌', emoji: '⚡' }
}

export const GptSovitsSettingsSection: React.FC = () => {
  const [config, setConfig] = useState<GptSovitsConfig | null>(null)
  const [scanResult, setScanResult] = useState<InferenceDirScanResult | null>(null)
  const [isOnline, setIsOnline] = useState<boolean | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [testingMood, setTestingMood] = useState<string | null>(null)
  const [petVisible, setPetVisible] = useState(false)

  // 1. 加载配置与健康检查
  const loadData = useCallback(async () => {
    try {
      const cfg = await window.api?.tts?.getConfig?.()
      if (cfg) {
        setConfig(cfg)
        if (cfg.inferenceDir) {
          const scan = await window.api?.tts?.scanInferenceDir?.(cfg.inferenceDir)
          if (scan) setScanResult(scan)
        }
      }
      const health = await window.api?.tts?.checkHealth?.()
      setIsOnline(Boolean(health))
    } catch (e) {
      console.warn('[GPT-SoVITS Settings] 读取配置失败:', e)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // 2. 选择本地推理文件夹
  const handleSelectInferenceDir = async () => {
    try {
      setIsScanning(true)
      const res = await window.api?.tts?.selectInferenceDir?.()
      if (res) {
        setConfig((prev) => (prev ? { ...prev, inferenceDir: res.dir } : null))
        setScanResult(res.scanResult)
      }
    } finally {
      setIsScanning(false)
    }
  }

  // 3. 重新扫描当前目录
  const handleRescan = async () => {
    if (!config?.inferenceDir) return
    try {
      setIsScanning(true)
      const scan = await window.api?.tts?.scanInferenceDir?.(config.inferenceDir)
      if (scan) setScanResult(scan)
    } finally {
      setIsScanning(false)
    }
  }

  // 4. 切换模型权重
  const handleGptWeightsChange = async (path: string) => {
    setConfig((prev) => (prev ? { ...prev, gptWeightsPath: path } : null))
    await window.api?.tts?.setGptWeights?.(path)
  }

  const handleSovitsWeightsChange = async (path: string) => {
    setConfig((prev) => (prev ? { ...prev, sovitsWeightsPath: path } : null))
    await window.api?.tts?.setSovitsWeights?.(path)
  }

  // 5. 修改情绪参考音频映射
  const handleMoodAudioChange = async (
    mood: BanXiaMood,
    audioPath: string,
    promptText = '',
    promptLang = 'ja'
  ) => {
    const entry: VoiceMoodEntry = { audioPath, promptText, promptLang }
    const updatedMap = await window.api?.tts?.setMoodEntry?.(mood, entry)
    if (updatedMap && scanResult) {
      setScanResult({ ...scanResult, moodMap: updatedMap })
    }
  }

  // 6. 试听指定情绪
  const handleAuditionMood = async (mood: BanXiaMood) => {
    const entry = scanResult?.moodMap[mood]
    if (!entry) return
    setTestingMood(mood)
    try {
      const res = await window.api?.tts?.synthesize?.({
        text: `这是半夏的${MOOD_LABELS[mood].name}测试语音。`,
        mood,
        refAudioPath: entry.audioPath,
        promptText: entry.promptText,
        promptLang: entry.promptLang
      })

      if (res?.success && res?.audioBuffer) {
        const blob = new Blob([res.audioBuffer], { type: 'audio/wav' })
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.onended = () => {
          URL.revokeObjectURL(url)
          setTestingMood(null)
        }
        audio.onerror = () => {
          URL.revokeObjectURL(url)
          setTestingMood(null)
        }
        await audio.play()
      } else {
        alert(res?.offline ? '本地 GPT-SoVITS 服务未启动 (127.0.0.1:9880)' : (res?.error || '试听失败'))
        setTestingMood(null)
      }
    } catch (e: any) {
      alert(`试听出错: ${e.message}`)
      setTestingMood(null)
    }
  }

  // 7. 切换桌宠
  const handleTogglePet = async () => {
    const next = await window.api?.pet?.toggle?.()
    setPetVisible(Boolean(next))
  }

  if (!config) return null

  return (
    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color, #E4E7EB)' }}>
      {/* 头部标题与桌宠快捷启动 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
              本地 GPT-SoVITS-v2proplus 推理管线
            </h3>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '12px',
                backgroundColor: isOnline ? '#D4EDDA' : '#F8D7DA',
                color: isOnline ? '#155724' : '#721C24',
                fontWeight: 500
              }}
            >
              {isOnline ? '🟢 服务在线' : '⚪ 离线 (降级文本气泡)'}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#636E72', marginTop: '4px' }}>
            直连本地 127.0.0.1:9880，支持扫描本地推理文件夹、动态热加载权重与桌宠表情同步
          </div>
        </div>

        <button
          onClick={handleTogglePet}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid #0984E3',
            backgroundColor: '#0984E3',
            color: '#FFFFFF',
            fontSize: '12.5px',
            cursor: 'pointer',
            fontWeight: 500
          }}
        >
          {petVisible ? '隐藏半夏桌宠' : '🎨 唤出半夏桌宠'}
        </button>
      </div>

      {/* 推理文件夹路径选择 */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '12.5px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
          本地 GPT-SoVITS-v2proplus 推理文件夹：
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            readOnly
            value={config.inferenceDir || '未绑定本地推理文件夹'}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '12px',
              borderRadius: '6px',
              border: '1px solid #DFE6E9',
              backgroundColor: '#F8F9FA'
            }}
          />
          <button
            onClick={handleSelectInferenceDir}
            disabled={isScanning}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #DFE6E9',
              backgroundColor: '#FFFFFF',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            {isScanning ? '扫描中...' : '📁 浏览选择...'}
          </button>
          <button
            onClick={handleRescan}
            disabled={isScanning || !config.inferenceDir}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #DFE6E9',
              backgroundColor: '#FFFFFF',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            🔄 重新扫描
          </button>
        </div>
      </div>

      {/* 模型权重选择 */}
      {scanResult && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          {/* GPT 权重 */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
              GPT 模型权重 (.ckpt)：
            </label>
            <select
              value={config.gptWeightsPath}
              onChange={(e) => handleGptWeightsChange(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px',
                fontSize: '12px',
                borderRadius: '6px',
                border: '1px solid #DFE6E9'
              }}
            >
              <option value="">-- 请选择 .ckpt 权重 --</option>
              {scanResult.gptWeights.map((w) => (
                <option key={w} value={w}>
                  {w.split(/[\\/]/).pop()}
                </option>
              ))}
            </select>
          </div>

          {/* SoVITS 权重 */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
              SoVITS 模型权重 (.pth)：
            </label>
            <select
              value={config.sovitsWeightsPath}
              onChange={(e) => handleSovitsWeightsChange(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px',
                fontSize: '12px',
                borderRadius: '6px',
                border: '1px solid #DFE6E9'
              }}
            >
              <option value="">-- 请选择 .pth 权重 --</option>
              {scanResult.sovitsWeights.map((w) => (
                <option key={w} value={w}>
                  {w.split(/[\\/]/).pop()}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* 情绪参考音频映射表 */}
      {scanResult && scanResult.audioFiles.length > 0 && (
        <div>
          <label style={{ fontSize: '12.5px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
            情绪参考音频映射（支持 voice_mood_map.json / .lab / 文件名内嵌 3 种格式）：
          </label>
          <div
            style={{
              border: '1px solid #DFE6E9',
              borderRadius: '8px',
              overflow: 'hidden',
              fontSize: '12px'
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1.5fr 2fr 80px 70px',
                padding: '8px 12px',
                backgroundColor: '#F8F9FA',
                fontWeight: 600,
                borderBottom: '1px solid #DFE6E9'
              }}
            >
              <span>情绪类别</span>
              <span>参考音频文件</span>
              <span>参考文本 (Prompt Text)</span>
              <span>语言</span>
              <span style={{ textAlign: 'center' }}>操作</span>
            </div>

            {(Object.keys(MOOD_LABELS) as BanXiaMood[]).map((mood) => {
              const entry = scanResult.moodMap[mood]
              const isTesting = testingMood === mood

              return (
                <div
                  key={mood}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 1.5fr 2fr 80px 70px',
                    padding: '8px 12px',
                    borderBottom: '1px solid #F1F2F6',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span style={{ fontWeight: 500 }}>
                    {MOOD_LABELS[mood].emoji} {MOOD_LABELS[mood].name}
                  </span>

                  <select
                    value={entry?.audioPath || ''}
                    onChange={(e) =>
                      handleMoodAudioChange(mood, e.target.value, entry?.promptText, entry?.promptLang)
                    }
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '11.5px',
                      borderRadius: '4px',
                      border: '1px solid #DFE6E9'
                    }}
                  >
                    <option value="">-- 选择参考音频 --</option>
                    {scanResult.audioFiles.map((af) => (
                      <option key={af.path} value={af.path}>
                        {af.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={entry?.promptText || ''}
                    placeholder="输入或自动读取的参考文本"
                    onChange={(e) =>
                      handleMoodAudioChange(mood, entry?.audioPath || '', e.target.value, entry?.promptLang)
                    }
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '11.5px',
                      borderRadius: '4px',
                      border: '1px solid #DFE6E9'
                    }}
                  />

                  <select
                    value={entry?.promptLang || 'ja'}
                    onChange={(e) =>
                      handleMoodAudioChange(mood, entry?.audioPath || '', entry?.promptText, e.target.value)
                    }
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '11.5px',
                      borderRadius: '4px',
                      border: '1px solid #DFE6E9'
                    }}
                  >
                    <option value="ja">日语 (ja)</option>
                    <option value="zh">中文 (zh)</option>
                  </select>

                  <button
                    onClick={() => handleAuditionMood(mood)}
                    disabled={!entry?.audioPath || isTesting}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      border: '1px solid #DFE6E9',
                      backgroundColor: isTesting ? '#EBF5FB' : '#FAFAFA',
                      color: isTesting ? '#0984E3' : '#2D3436',
                      fontSize: '11px',
                      cursor: entry?.audioPath ? 'pointer' : 'not-allowed',
                      opacity: entry?.audioPath ? 1 : 0.5
                    }}
                  >
                    {isTesting ? '▶ ...' : '试听'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
