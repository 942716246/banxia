import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { BanXiaTachie } from '@baishou/shared'
import { isInteractivePixel, shouldIgnoreMouse } from '@baishou/shared'
import { PetTachieIllustrations } from './PetTachieIllustrations'

interface PetCanvasProps {
  tachie: BanXiaTachie
  isSpeaking: boolean
  isUiHovered: boolean
  customImageUrl?: string
  scale?: number
  onContextMenu: (e: React.MouseEvent) => void
  onCharacterClick: () => void
}

export const PetCanvas: React.FC<PetCanvasProps> = ({
  tachie,
  isSpeaking,
  isUiHovered,
  customImageUrl,
  scale = 1.0,
  onContextMenu,
  onCharacterClick
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ screenX: number; screenY: number } | null>(null)
  const clickStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const isIgnoringMouseRef = useRef(false)

  // 1. 将立绘（自定义图片或 SVG）渲染到离屏 Canvas 上，用于像素级 Alpha 读取
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    canvas.width = 300
    canvas.height = 450
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (customImageUrl) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      }
      img.src = customImageUrl
    } else {
      // 将内置 SVG 序列化后绘制到 Canvas
      const svgElement = containerRef.current?.querySelector('svg')
      if (svgElement) {
        const xml = new XMLSerializer().serializeToString(svgElement)
        const svg64 = btoa(unescape(encodeURIComponent(xml)))
        const b64Start = 'data:image/svg+xml;base64,'
        const image64 = b64Start + svg64

        const img = new Image()
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        }
        img.src = image64
      }
    }
  }, [tachie, customImageUrl, isSpeaking])

  // 2. 鼠标移动检测 Alpha 通道：<= 50 自动穿透，> 50 或悬停交互元素时捕获
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) return
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const rect = container.getBoundingClientRect()
      const clientX = e.clientX - rect.left
      const clientY = e.clientY - rect.top

      // 缩放映射到 Canvas 原始分辨率 300x450
      const px = Math.floor((clientX / rect.width) * canvas.width)
      const py = Math.floor((clientY / rect.height) * canvas.height)

      let alpha = 0
      if (px >= 0 && px < canvas.width && py >= 0 && py < canvas.height) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const pixel = ctx.getImageData(px, py, 1, 1).data
          alpha = pixel[3]
        }
      }

      const shouldIgnore = shouldIgnoreMouse(alpha, isUiHovered)

      if (shouldIgnore !== isIgnoringMouseRef.current) {
        isIgnoringMouseRef.current = shouldIgnore
        void window.api?.pet?.setIgnoreMouse(shouldIgnore)
      }
    },
    [isDragging, isUiHovered]
  )

  const handleMouseLeave = useCallback(() => {
    if (isDragging) return
    // 鼠标离开立绘且未悬停 UI 控件时，穿透底层
    if (!isUiHovered) {
      isIgnoringMouseRef.current = true
      void window.api?.pet?.setIgnoreMouse(true)
    }
  }, [isDragging, isUiHovered])

  // 3. 拖拽移动窗口：点击在实体像素上 (alpha > 50) 触发拖拽
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return // 只处理左键
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const rect = container.getBoundingClientRect()
      const px = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width)
      const py = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height)

      const ctx = canvas.getContext('2d')
      const alpha = ctx?.getImageData(px, py, 1, 1).data[3] ?? 0

      if (isInteractivePixel(alpha)) {
        setIsDragging(true)
        dragStartRef.current = { screenX: e.screenX, screenY: e.screenY }
        clickStartRef.current = { x: e.screenX, y: e.screenY, time: Date.now() }
      }
    },
    []
  )

  useEffect(() => {
    if (!isDragging) return

    const onGlobalMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return
      const dx = e.screenX - dragStartRef.current.screenX
      const dy = e.screenY - dragStartRef.current.screenY
      dragStartRef.current = { screenX: e.screenX, screenY: e.screenY }
      void window.api?.pet?.moveBy(dx, dy)
    }

    const onGlobalMouseUp = (e: MouseEvent) => {
      setIsDragging(false)
      if (clickStartRef.current) {
        const dist =
          Math.hypot(e.screenX - clickStartRef.current.x, e.screenY - clickStartRef.current.y)
        const duration = Date.now() - clickStartRef.current.time
        // 如果移动距离小于 5 像素且耗时小于 300ms，判定为单次点击
        if (dist < 5 && duration < 300) {
          onCharacterClick()
        }
      }
      dragStartRef.current = null
      clickStartRef.current = null
    }

    window.addEventListener('mousemove', onGlobalMouseMove)
    window.addEventListener('mouseup', onGlobalMouseUp)

    return () => {
      window.removeEventListener('mousemove', onGlobalMouseMove)
      window.removeEventListener('mouseup', onGlobalMouseUp)
    }
  }, [isDragging, onCharacterClick])

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onContextMenu={onContextMenu}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        cursor: isDragging ? 'grabbing' : 'pointer',
        userSelect: 'none',
        animation: 'pet-breathe 4s ease-in-out infinite'
      }}
    >
      <style>{`
        @keyframes pet-breathe {
          0%, 100% {
            transform: translateY(0px) scale(1);
          }
          50% {
            transform: translateY(-4px) scale(1.008);
          }
        }
      `}</style>

      {/* 隐藏的离屏 Canvas，用于 Alpha 像素采样 */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* 立绘呈现 */}
      {customImageUrl ? (
        <img
          src={customImageUrl}
          alt="Banxia Tachie"
          style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
        />
      ) : (
        <PetTachieIllustrations tachie={tachie} isSpeaking={isSpeaking} />
      )}
    </div>
  )
}
