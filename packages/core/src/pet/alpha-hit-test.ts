export const DEFAULT_ALPHA_THRESHOLD = 50

/**
 * 判定当前像素的 Alpha 值是否属于可交互的不透明区域（复刻 ZcChat2 的 alpha > 50 逻辑）
 *
 * @param alpha 像素 Alpha 通道值 (0 ~ 255)
 * @param threshold 阈值，默认 50
 * @returns true: 不透明区域，捕获鼠标；false: 透明区域，穿透鼠标
 */
export function isInteractivePixel(alpha: number, threshold = DEFAULT_ALPHA_THRESHOLD): boolean {
  return alpha > threshold
}

/**
 * 计算 Electron 窗口的 setIgnoreMouseEvents 状态
 *
 * @param alpha 鼠标所在立绘像素的 Alpha 值 (0 ~ 255)
 * @param isUiHovered 鼠标当前是否正悬停在气泡、输入框或菜单等 UI 交互控件上
 * @param threshold Alpha 阈值，默认 50
 * @returns true: 需要调用 setIgnoreMouseEvents(true, { forward: true }) 穿透到底层；
 *          false: 需要调用 setIgnoreMouseEvents(false) 捕获鼠标
 */
export function shouldIgnoreMouse(
  alpha: number,
  isUiHovered: boolean,
  threshold = DEFAULT_ALPHA_THRESHOLD
): boolean {
  if (isUiHovered) {
    return false // 悬停在气泡或操作界面上时绝对不穿透
  }
  return alpha <= threshold
}
