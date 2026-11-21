import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Sliders,
  X,
  RotateCcw,
  Eye,
  Save,
  Copy,
  Check,
  BookmarkPlus,
  Trash2
} from 'lucide-react'
import { withAppContentOverlay } from '@baishou/ui'
import styles from './PromptWorkbenchDrawer.module.css'

export interface PromptWorkbenchDrawerProps {
  open: boolean
  onClose: () => void
  sessionId?: string
}

interface PromptConfig {
  personaPrompt?: string
  userIdentityPrompt?: string
  companionAndToolPrompt?: string
  expressionProtocolTemplate?: string
  activePreset?: string
  presets?: Record<
    string,
    {
      name: string
      personaPrompt?: string
      userIdentityPrompt?: string
      companionAndToolPrompt?: string
      expressionProtocolTemplate?: string
    }
  >
}

export const PromptWorkbenchDrawer: React.FC<PromptWorkbenchDrawerProps> = ({
  open,
  onClose,
  sessionId
}) => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'modules' | 'inspector' | 'presets'>('modules')

  // 四大模块状态
  const [persona, setPersona] = useState('')
  const [userIdentity, setUserIdentity] = useState('')
  const [companionTool, setCompanionTool] = useState('')
  const [expressionProtocol, setExpressionProtocol] = useState('')

  // 默认值缓存
  const [defaults, setDefaults] = useState<{
    personaPrompt?: string
    userIdentityPrompt?: string
    companionAndToolPrompt?: string
    expressionProtocolTemplate?: string
  }>({})

  // 快照管理
  const [presets, setPresets] = useState<Record<string, any>>({})
  const [newPresetName, setNewPresetName] = useState('')

  // 透视状态
  const [assembledPrompt, setAssembledPrompt] = useState('')
  const [isLoadingInspector, setIsLoadingInspector] = useState(false)
  const [copied, setCopied] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

  // 1. 初始化读取配置与默认值
  const loadConfig = useCallback(async () => {
    try {
      const api = (window as any).api?.promptWorkbench
      if (!api) return

      const [cfg, defs] = await Promise.all([api.getConfig(), api.getDefaults()])
      if (cfg) {
        setPersona(cfg.personaPrompt || '')
        setUserIdentity(cfg.userIdentityPrompt || '')
        setCompanionTool(cfg.companionAndToolPrompt || '')
        setExpressionProtocol(cfg.expressionProtocolTemplate || '')
        setPresets(cfg.presets || {})
      }
      if (defs) {
        setDefaults(defs)
      }
    } catch (e) {
      console.error('[PromptWorkbench] 加载配置失败:', e)
    }
  }, [])

  useEffect(() => {
    if (open) {
      loadConfig()
    }
  }, [open, loadConfig])

  // 2. 加载完整 Prompt 透视预览
  const refreshInspector = useCallback(async () => {
    try {
      setIsLoadingInspector(true)
      const api = (window as any).api?.promptWorkbench
      if (!api) return

      const assembled = await api.getAssembledPrompt({
        sessionId,
        overrides: {
          personaPrompt: persona,
          userIdentityPrompt: userIdentity,
          companionAndToolPrompt: companionTool,
          expressionProtocolTemplate: expressionProtocol
        }
      })
      setAssembledPrompt(assembled || '')
    } catch (e: any) {
      setAssembledPrompt(`// 获取透视失败: ${e.message || String(e)}`)
    } finally {
      setIsLoadingInspector(false)
    }
  }, [sessionId, persona, userIdentity, companionTool, expressionProtocol])

  useEffect(() => {
    if (open && activeTab === 'inspector') {
      refreshInspector()
    }
  }, [open, activeTab, refreshInspector])

  // 3. 保存配置生效
  const handleSave = async () => {
    try {
      const api = (window as any).api?.promptWorkbench
      if (!api) return

      await api.saveConfig({
        personaPrompt: persona,
        userIdentityPrompt: userIdentity,
        companionAndToolPrompt: companionTool,
        expressionProtocolTemplate: expressionProtocol,
        presets
      })

      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 2000)
    } catch (e) {
      console.error('[PromptWorkbench] 保存失败:', e)
    }
  }

  // 4. 快照管理逻辑
  const handleSavePreset = () => {
    if (!newPresetName.trim()) return
    const key = `preset_${Date.now()}`
    const updated = {
      ...presets,
      [key]: {
        name: newPresetName.trim(),
        personaPrompt: persona,
        userIdentityPrompt: userIdentity,
        companionAndToolPrompt: companionTool,
        expressionProtocolTemplate: expressionProtocol
      }
    }
    setPresets(updated)
    setNewPresetName('')
    void (window as any).api?.promptWorkbench?.saveConfig({ presets: updated })
  }

  const handleApplyPreset = (item: any) => {
    setPersona(item.personaPrompt || '')
    setUserIdentity(item.userIdentityPrompt || '')
    setCompanionTool(item.companionAndToolPrompt || '')
    setExpressionProtocol(item.expressionProtocolTemplate || '')
  }

  const handleDeletePreset = (key: string) => {
    const updated = { ...presets }
    delete updated[key]
    setPresets(updated)
    void (window as any).api?.promptWorkbench?.saveConfig({ presets: updated })
  }

  // 5. 复制透视内容
  const handleCopyPrompt = () => {
    if (!assembledPrompt) return
    navigator.clipboard.writeText(assembledPrompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!open) return null

  return (
    <div className={withAppContentOverlay(styles.backdrop)} role="presentation" onClick={onClose}>
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="提示词调优工作台"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶栏 Header */}
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <Sliders size={18} className={styles.titleIcon} aria-hidden />
            <h2 className={styles.title}>提示词调优工作台 · Prompt Workbench</h2>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </header>

        {/* 导航 Tabs */}
        <nav className={styles.navTabs}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'modules' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('modules')}
          >
            四大模块微调
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'inspector' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('inspector')}
          >
            完整 Prompt 透视
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'presets' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('presets')}
          >
            预设快照管理
          </button>
        </nav>

        {/* 主内容区 */}
        <div className={styles.content}>
          {activeTab === 'modules' && (
            <>
              {/* 模块 A：半夏核心人设 */}
              <div className={styles.moduleCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitle}>
                    <span>模块 A：半夏人设定义 (&lt;assistant_persona&gt;)</span>
                    <span className={styles.cardBadge}>
                      {persona.trim() ? '已自定义' : '内置默认 (920字)'}
                    </span>
                  </div>
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.miniBtn}
                      onClick={() => setPersona('')}
                      title="重置为系统默认"
                    >
                      <RotateCcw size={12} style={{ marginRight: 4 }} />
                      恢复默认
                    </button>
                  </div>
                </div>
                <p className={styles.cardHint}>
                  定义半夏的审美偏好、性格底色、说话口吻与核心禁忌。留空时使用内置定稿 920 字半夏人设。
                </p>
                <textarea
                  className={styles.textarea}
                  rows={6}
                  placeholder={defaults.personaPrompt || '输入自定义人设，留空则使用内置默认人设...'}
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                />
              </div>

              {/* 模块 B：魂小小用户卡 */}
              <div className={styles.moduleCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitle}>
                    <span>模块 B：用户身份描述 (&lt;user_identity&gt;)</span>
                    <span className={styles.cardBadge}>
                      {userIdentity.trim() ? '已自定义' : '内置默认 (魂小小)'}
                    </span>
                  </div>
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.miniBtn}
                      onClick={() => setUserIdentity('')}
                      title="重置为系统默认"
                    >
                      <RotateCcw size={12} style={{ marginRight: 4 }} />
                      恢复默认
                    </button>
                  </div>
                </div>
                <p className={styles.cardHint}>
                  告知半夏关于你的背景经历（如 90 后作者、写过《尾页》《无意识》等小说、日常习惯）。
                </p>
                <textarea
                  className={styles.textarea}
                  rows={4}
                  placeholder={
                    defaults.userIdentityPrompt || '输入自定义用户卡，留空则使用内置默认卡片...'
                  }
                  value={userIdentity}
                  onChange={(e) => setUserIdentity(e.target.value)}
                />
              </div>

              {/* 模块 C：陪伴与工具调用准则 */}
              <div className={styles.moduleCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitle}>
                    <span>模块 C：陪伴与工具调用准则 (&lt;tool_guidelines&gt;)</span>
                    <span className={styles.cardBadge}>
                      {companionTool.trim() ? '已生效' : '系统自动'}
                    </span>
                  </div>
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.miniBtn}
                      onClick={() => setCompanionTool('')}
                      title="清空自定义准则"
                    >
                      <RotateCcw size={12} style={{ marginRight: 4 }} />
                      清空
                    </button>
                  </div>
                </div>
                <p className={styles.cardHint}>
                  指导半夏何时调用写随笔（diary_write）、读档案、桌面感知等工具的准则。
                </p>
                <textarea
                  className={styles.textarea}
                  rows={4}
                  placeholder="可在此输入自定义工具调用准则，或留空让系统自动按启用工具动态生成..."
                  value={companionTool}
                  onChange={(e) => setCompanionTool(e.target.value)}
                />
              </div>

              {/* 模块 D：立绘与情绪输出协议 */}
              <div className={styles.moduleCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitle}>
                    <span>模块 D：立绘/情绪标记协议模板 (&lt;expression_protocol&gt;)</span>
                    <span className={styles.cardBadge}>
                      {expressionProtocol.trim() ? '自定义模板' : '动态标准模板'}
                    </span>
                  </div>
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.miniBtn}
                      onClick={() => setExpressionProtocol('')}
                      title="恢复系统标准模板"
                    >
                      <RotateCcw size={12} style={{ marginRight: 4 }} />
                      恢复默认
                    </button>
                  </div>
                </div>
                <p className={styles.cardHint}>
                  可自由微调输出规范。支持占位符 <code>{'{{AVAILABLE_MOODS}}'}</code>，系统会自动替换为当前本地推理文件夹已扫描出的情绪列表。
                </p>
                <textarea
                  className={styles.textarea}
                  rows={4}
                  placeholder={
                    defaults.expressionProtocolTemplate ||
                    '在每句话开头附带立绘情绪标记（支持：{{AVAILABLE_MOODS}}）...'
                  }
                  value={expressionProtocol}
                  onChange={(e) => setExpressionProtocol(e.target.value)}
                />
              </div>
            </>
          )}

          {activeTab === 'inspector' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
              <div className={styles.inspectorBar}>
                <span className={styles.cardHint}>
                  {isLoadingInspector ? '正在装配最新上下文…' : `完整 Prompt 透视（包含记忆、环境感知、当前工具）`}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className={styles.miniBtn} onClick={refreshInspector}>
                    <Eye size={12} style={{ marginRight: 4 }} />
                    刷新透视
                  </button>
                  <button type="button" className={styles.miniBtn} onClick={handleCopyPrompt}>
                    {copied ? (
                      <>
                        <Check size={12} style={{ marginRight: 4, color: '#4caf50' }} />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy size={12} style={{ marginRight: 4 }} />
                        一键复制完整 Prompt
                      </>
                    )}
                  </button>
                </div>
              </div>
              <pre className={styles.inspectorBox}>{assembledPrompt}</pre>
            </div>
          )}

          {activeTab === 'presets' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className={styles.moduleCard}>
                <div className={styles.cardTitle}>新建预设快照</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  <input
                    type="text"
                    style={{
                      flex: 1,
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: 6,
                      color: '#ffffff',
                      padding: '8px 12px',
                      fontSize: 13
                    }}
                    placeholder="输入快照名称（如：沉浸写小说模式 / 调侃坏笑模式）"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSavePreset()
                    }}
                  />
                  <button
                    type="button"
                    className={styles.saveBtn}
                    onClick={handleSavePreset}
                    disabled={!newPresetName.trim()}
                  >
                    <BookmarkPlus size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    保存当前配置为快照
                  </button>
                </div>
              </div>

              <div className={styles.cardTitle} style={{ marginTop: 10 }}>
                已保存的预设快照
              </div>
              {Object.keys(presets).length === 0 ? (
                <p className={styles.cardHint}>暂无保存的预设快照</p>
              ) : (
                Object.entries(presets).map(([k, item]: [string, any]) => (
                  <div key={k} className={styles.presetRow}>
                    <span className={styles.presetName}>{item.name}</span>
                    <div className={styles.presetActions}>
                      <button
                        type="button"
                        className={styles.miniBtn}
                        onClick={() => handleApplyPreset(item)}
                      >
                        应用此快照
                      </button>
                      <button
                        type="button"
                        className={styles.miniBtn}
                        style={{ color: '#ff6b6b' }}
                        onClick={() => handleDeletePreset(k)}
                        title="删除快照"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* 底栏 Footer */}
        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.resetAllBtn}
            onClick={() => {
              setPersona('')
              setUserIdentity('')
              setCompanionTool('')
              setExpressionProtocol('')
            }}
          >
            全部恢复默认
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {savedSuccess && (
              <span style={{ fontSize: 12, color: '#4caf50', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={14} /> 保存生效成功
              </span>
            )}
            <button type="button" className={styles.saveBtn} onClick={handleSave}>
              <Save size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              保存并立即生效
            </button>
          </div>
        </footer>
      </aside>
    </div>
  )
}
