import React from 'react'

interface PetBubbleProps {
  text: string
  visible: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}

export const PetBubble: React.FC<PetBubbleProps> = ({
  text,
  visible,
  onMouseEnter,
  onMouseLeave
}) => {
  if (!visible || !text) return null

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'absolute',
        top: '12px',
        left: '16px',
        right: '16px',
        zIndex: 100,
        backgroundColor: '#FFFFFF',
        color: '#2D3436',
        padding: '12px 16px',
        borderRadius: '16px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.08)',
        border: '1.5px solid rgba(0, 0, 0, 0.08)',
        fontSize: '13.5px',
        lineHeight: '1.5',
        fontWeight: 500,
        pointerEvents: 'auto',
        animation: 'bubble-pop 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
      }}
    >
      <style>{`
        @keyframes bubble-pop {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0px) scale(1);
          }
        }
      `}</style>

      {/* 台词内容 */}
      <div style={{ wordBreak: 'break-word', userSelect: 'text' }}>{text}</div>

      {/* 气泡三角尾巴指向半夏 */}
      <div
        style={{
          position: 'absolute',
          bottom: '-8px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: '8px solid #FFFFFF'
        }}
      />
    </div>
  )
}
