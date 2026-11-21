import React from 'react'

interface PetContextMenuProps {
  visible: boolean
  x: number
  y: number
  ttsEnabled: boolean
  perceptionEnabled: boolean
  currentScale: number
  onClose: () => void
  onOpenMainWindow: () => void
  onMuteInterrupt: () => void
  onToggleTts: () => void
  onTogglePerception: () => void
  onCaptureScreen: () => void
  onSetScale: (scale: number) => void
  onSelectInferenceDir: () => void
  onSelectTachieDir: () => void
  onHidePet: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

export const PetContextMenu: React.FC<PetContextMenuProps> = ({
  visible,
  x,
  y,
  ttsEnabled,
  perceptionEnabled,
  currentScale,
  onClose,
  onOpenMainWindow,
  onMuteInterrupt,
  onToggleTts,
  onTogglePerception,
  onCaptureScreen,
  onSetScale,
  onSelectInferenceDir,
  onSelectTachieDir,
  onHidePet,
  onMouseEnter,
  onMouseLeave
}) => {
  if (!visible) return null

  const menuItemStyle: React.CSSProperties = {
    padding: '7px 12px',
    fontSize: '12.5px',
    color: '#2D3436',
    cursor: 'pointer',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    transition: 'background 0.15s ease'
  }

  const scales = [0.6, 0.8, 1.0, 1.2, 1.4]

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: `${Math.min(x, 140)}px`,
        top: `${Math.min(y, 220)}px`,
        zIndex: 200,
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        padding: '6px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.08)',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        minWidth: '165px',
        userSelect: 'none',
        pointerEvents: 'auto',
        animation: 'menu-fade-in 0.18s ease-out'
      }}
    >
      <style>{`
        @keyframes menu-fade-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .pet-menu-item:hover {
          background-color: #F1F2F6;
          color: #0984E3;
        }
      `}</style>

      {/* 打开主界面 */}
      <div
        className="pet-menu-item"
        style={menuItemStyle}
        onClick={() => {
          onOpenMainWindow()
          onClose()
        }}
      >
        <span>📖 打开半夏主界面</span>
      </div>

      {/* 静音/打断当前语音 */}
      <div
        className="pet-menu-item"
        style={menuItemStyle}
        onClick={() => {
          onMuteInterrupt()
          onClose()
        }}
      >
        <span>⏹ 静音 / 打断语音</span>
      </div>

      {/* 语音开关 */}
      <div
        className="pet-menu-item"
        style={menuItemStyle}
        onClick={() => {
          onToggleTts()
          onClose()
        }}
      >
        <span>🔊 语音合成</span>
        <span style={{ fontSize: '11px', color: ttsEnabled ? '#00B894' : '#B2BEC3' }}>
          {ttsEnabled ? '开启' : '关闭'}
        </span>
      </div>

      {/* 桌面活动窗口感知开关 */}
      <div
        className="pet-menu-item"
        style={menuItemStyle}
        onClick={() => {
          onTogglePerception()
          onClose()
        }}
      >
        <span>🖥️ 桌面活动感知</span>
        <span style={{ fontSize: '11px', color: perceptionEnabled ? '#00B894' : '#B2BEC3' }}>
          {perceptionEnabled ? '开启' : '关闭'}
        </span>
      </div>

      {/* 截图给半夏看 */}
      <div
        className="pet-menu-item"
        style={menuItemStyle}
        onClick={() => {
          onCaptureScreen()
          onClose()
        }}
      >
        <span>📷 给半夏看一眼屏幕</span>
      </div>

      <div style={{ height: '1px', backgroundColor: '#E4E7EB', margin: '4px 6px' }} />

      {/* 缩放选择 */}
      <div style={{ padding: '4px 12px', fontSize: '11px', color: '#636E72', fontWeight: 600 }}>
        立绘缩放大小
      </div>
      <div style={{ display: 'flex', gap: '4px', padding: '2px 8px 6px' }}>
        {scales.map((s) => (
          <button
            key={s}
            onClick={() => {
              onSetScale(s)
              onClose()
            }}
            style={{
              flex: 1,
              padding: '3px 0',
              fontSize: '11px',
              borderRadius: '4px',
              border: Math.abs(currentScale - s) < 0.05 ? '1px solid #0984E3' : '1px solid #DFE6E9',
              backgroundColor: Math.abs(currentScale - s) < 0.05 ? '#EBF5FB' : '#FAFAFA',
              color: Math.abs(currentScale - s) < 0.05 ? '#0984E3' : '#2D3436',
              cursor: 'pointer'
            }}
          >
            {Math.round(s * 100)}%
          </button>
        ))}
      </div>

      <div style={{ height: '1px', backgroundColor: '#E4E7EB', margin: '4px 6px' }} />

      {/* 选择 GPT-SoVITS 推理文件夹 */}
      <div
        className="pet-menu-item"
        style={menuItemStyle}
        onClick={() => {
          onSelectInferenceDir()
          onClose()
        }}
      >
        <span>📁 绑定本地 GPT-SoVITS</span>
      </div>

      {/* 选择自定义立绘文件夹 */}
      <div
        className="pet-menu-item"
        style={menuItemStyle}
        onClick={() => {
          onSelectTachieDir()
          onClose()
        }}
      >
        <span>🎨 选择本地立绘文件夹</span>
      </div>

      <div style={{ height: '1px', backgroundColor: '#E4E7EB', margin: '4px 6px' }} />

      {/* 隐藏桌宠 */}
      <div
        className="pet-menu-item"
        style={{ ...menuItemStyle, color: '#D63031' }}
        onClick={() => {
          onHidePet()
          onClose()
        }}
      >
        <span>✖ 隐藏半夏桌宠</span>
      </div>
    </div>
  )
}
