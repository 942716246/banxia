import React, { useState, useRef, useEffect } from 'react'
import type { VoiceInputState } from '@baishou/shared'

interface PetQuickInputProps {
  visible: boolean
  isSpeaking: boolean
  voiceState: VoiceInputState
  onSend: (text: string) => void
  onCaptureScreen: () => void
  onToggleVoice: () => void
  onClose: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

export const PetQuickInput: React.FC<PetQuickInputProps> = ({
  visible,
  isSpeaking,
  voiceState,
  onSend,
  onCaptureScreen,
  onToggleVoice,
  onClose,
  onMouseEnter,
  onMouseLeave
}) => {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setText('')
    }
  }, [visible])

  if (!visible) return null

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (text.trim()) {
        onSend(text.trim())
        setText('')
        onClose()
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const isRecording = voiceState === 'recording'

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        bottom: '16px',
        left: '12px',
        right: '12px',
        zIndex: 150,
        backgroundColor: '#FFFFFF',
        borderRadius: '24px',
        padding: '5px 10px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2), 0 2px 6px rgba(0, 0, 0, 0.08)',
        border: '1.5px solid rgba(0, 0, 0, 0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        pointerEvents: 'auto',
        animation: 'quick-input-slide 0.2s ease-out'
      }}
    >
      <style>{`
        @keyframes quick-input-slide {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0px) scale(1);
          }
        }
        @keyframes mic-recording-pulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.6); }
          70% { transform: scale(1.08); box-shadow: 0 0 0 6px rgba(231, 76, 60, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(231, 76, 60, 0); }
        }
      `}</style>

      {/* 截图给半夏看按钮 */}
      <button
        onClick={onCaptureScreen}
        title="给半夏看一眼当前屏幕"
        style={{
          border: 'none',
          backgroundColor: '#F1F2F6',
          borderRadius: '50%',
          width: '26px',
          height: '26px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '13px',
          cursor: 'pointer',
          padding: 0
        }}
      >
        📷
      </button>

      {/* 麦克风对讲按钮（防回声锁 + 抢断打断） */}
      <button
        onClick={onToggleVoice}
        title={
          isRecording
            ? '正在录音中... 点击停止并发送'
            : isSpeaking
              ? '半夏正在说话（点击立即打断并录音）'
              : '按住/点击对讲说话'
        }
        style={{
          border: 'none',
          backgroundColor: isRecording ? '#E74C3C' : isSpeaking ? '#F39C12' : '#F1F2F6',
          color: isRecording || isSpeaking ? '#FFFFFF' : '#2D3436',
          borderRadius: '50%',
          width: '26px',
          height: '26px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          cursor: 'pointer',
          animation: isRecording ? 'mic-recording-pulse 1.2s infinite' : 'none',
          padding: 0
        }}
      >
        {isRecording ? '⏹' : isSpeaking ? '⚡' : '🎙️'}
      </button>

      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isRecording ? '正在倾听...' : '跟半夏搭话...'}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          fontSize: '12.5px',
          color: '#2D3436',
          backgroundColor: 'transparent',
          padding: '4px 0'
        }}
      />

      <button
        onClick={() => {
          if (text.trim()) {
            onSend(text.trim())
            setText('')
            onClose()
          }
        }}
        title="发送"
        style={{
          border: 'none',
          backgroundColor: '#0984E3',
          color: '#FFFFFF',
          borderRadius: '50%',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          cursor: 'pointer',
          flexShrink: 0
        }}
      >
        ↑
      </button>
    </div>
  )
}
