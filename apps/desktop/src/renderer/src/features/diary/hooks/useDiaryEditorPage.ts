import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  formatLocalDate,
  normalizeWeatherId,
  normalizeMoodId,
  normalizeDiaryTags,
  safeParseDate,
  logger,
  joinDiaryContentWithAppendBlock,
  resolveDiaryAppendBlock,
  resolveDiaryNewEntryContent,
  composeDiaryEditorContent,
  parseDiaryEditorContent,
  type DiaryTemplateConfig
} from '@baishou/shared'
import { useDialog, useToast } from '@baishou/ui'

type DiaryEditorInitialState = {
  content: string
  title: string
  selectedDate: Date
  weather: string
  mood: string
  isFavorite: boolean
  mediaPaths: string[]
}

function normalizeDiaryContentForCompare(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

export function useDiaryEditorPage() {
  const { t } = useTranslation()
  const { dateStr } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const dialog = useDialog()

  const isNumericId = typeof dateStr === 'string' && /^\d+$/.test(dateStr)
  const entryTypeParam = (searchParams.get('type') as
    | 'daily_diary'
    | 'banxia_essay'
    | 'novel_archive'
    | null) ?? 'daily_diary'
  const isAppendMode = searchParams.get('append') === '1'

  const parseInitialDate = useCallback((): Date => {
    if (!dateStr || dateStr === 'new' || (typeof dateStr === 'string' && /^\d+$/.test(dateStr))) {
      const dParam = searchParams.get('date')
      return safeParseDate(dParam ?? undefined)
    }
    return safeParseDate(dateStr)
  }, [dateStr, searchParams])

  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [entryType, setEntryType] = useState<'daily_diary' | 'banxia_essay' | 'novel_archive'>(
    entryTypeParam
  )
  const [authorRole, setAuthorRole] = useState<'user' | 'assistant'>(
    entryTypeParam === 'banxia_essay' ? 'assistant' : 'user'
  )
  const [selectedDate, setSelectedDate] = useState<Date>(() => parseInitialDate())
  const [weather, setWeather] = useState('')
  const [mood, setMood] = useState('')
  const [isFavorite, setIsFavorite] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [diaryId, setDiaryId] = useState<number | null>(() => (isNumericId ? Number(dateStr) : null))
  const [mediaPaths, setMediaPaths] = useState<string[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [attachmentBasePath, setAttachmentBasePath] = useState('')
  const initialStateRef = useRef<DiaryEditorInitialState | null>(null)
  const stateSnapshotRef = useRef<DiaryEditorInitialState>({
    content: '',
    title: '',
    selectedDate: parseInitialDate(),
    weather: '',
    mood: '',
    isFavorite: false,
    mediaPaths: []
  })

  useEffect(() => {
    stateSnapshotRef.current = {
      content,
      title,
      selectedDate,
      weather,
      mood,
      isFavorite,
      mediaPaths
    }
  }, [content, title, selectedDate, weather, mood, isFavorite, mediaPaths])

  const loadTemplateConfig = useCallback(async (): Promise<DiaryTemplateConfig> => {
    try {
      const api = (window as any).api?.settings
      if (api?.getDiaryTemplateConfig) {
        return (await api.getDiaryTemplateConfig()) || {}
      }
    } catch (e) {
      logger.warn('Failed to load diary template config', { error: e })
    }
    return {}
  }, [])

  const fetchAttachmentDir = useCallback(async (date: Date): Promise<string> => {
    try {
      const api = (window as any).api?.diary
      if (!api?.getAttachmentDir) return ''
      const result = await api.getAttachmentDir(formatLocalDate(date))
      return result?.success && result.path ? result.path : ''
    } catch (e) {
      logger.warn('Failed to load diary attachment dir', { error: e })
      return ''
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const initEditor = async () => {
      setIsLoading(true)
      const initialDate = parseInitialDate()
      const api = typeof window !== 'undefined' ? (window as any).api?.diary : undefined

      if (!dateStr || dateStr === 'new') {
        const [templateConfig, attPath] = await Promise.all([
          loadTemplateConfig(),
          fetchAttachmentDir(initialDate)
        ])
        if (cancelled) return
        setAttachmentBasePath(attPath)
        const now = new Date()
        const initialContent =
          entryTypeParam === 'daily_diary'
            ? resolveDiaryNewEntryContent(templateConfig, now)
            : ''
        setContent(initialContent)
        setTitle('')
        setSlug('')
        setEntryType(entryTypeParam)
        setAuthorRole(entryTypeParam === 'banxia_essay' ? 'assistant' : 'user')
        initialStateRef.current = {
          content: initialContent,
          title: '',
          selectedDate: initialDate,
          weather: '',
          mood: '',
          isFavorite: false,
          mediaPaths: []
        }
        setIsLoading(false)
        return
      }

      if (api) {
        try {
          const fetchDiaryPromise = isNumericId
            ? api.findById(Number(dateStr))
            : api.findByDate(dateStr)

          const [templateConfig, diary, attPath] = await Promise.all([
            loadTemplateConfig(),
            fetchDiaryPromise,
            fetchAttachmentDir(initialDate)
          ])
          if (cancelled) return
          setAttachmentBasePath(attPath)

          const now = new Date()
          let initialContent = ''
          let initialTitle = ''
          let initialWeather = ''
          let initialMood = ''
          let initialFavorite = false
          let initialMedia: string[] = []

          if (diary) {
            setDiaryId(diary.id || null)
            const resolvedType = (diary.entryType as any) || 'daily_diary'
            const resolvedRole =
              (diary.authorRole as any) || (resolvedType === 'banxia_essay' ? 'assistant' : 'user')
            setEntryType(resolvedType)
            setAuthorRole(resolvedRole)
            initialTitle = diary.title || ''
            setTitle(initialTitle)
            setSlug(diary.slug || '')

            const parsedTags = normalizeDiaryTags(diary.tags)
            const parsedWeather = normalizeWeatherId(diary.weather || '') || ''
            const parsedMood = normalizeMoodId(diary.mood || '') || ''
            setWeather(parsedWeather)
            setMood(parsedMood)
            setIsFavorite(diary.isFavorite || false)
            setMediaPaths(diary.mediaPaths || [])

            initialWeather = parsedWeather
            initialMood = parsedMood
            initialFavorite = diary.isFavorite || false
            initialMedia = diary.mediaPaths || []

            const composedExisting = composeDiaryEditorContent(diary.content || '', parsedTags)
            if (isAppendMode) {
              const timeMark = resolveDiaryAppendBlock(templateConfig, now)
              initialContent = joinDiaryContentWithAppendBlock(composedExisting, timeMark)
            } else {
              initialContent = composedExisting
            }
          } else {
            initialContent =
              entryTypeParam === 'daily_diary'
                ? resolveDiaryNewEntryContent(templateConfig, now)
                : ''
            setTitle('')
            setSlug('')
            setEntryType(entryTypeParam)
            setAuthorRole(entryTypeParam === 'banxia_essay' ? 'assistant' : 'user')
          }

          setContent(initialContent)
          initialStateRef.current = {
            content: initialContent,
            title: initialTitle,
            selectedDate: initialDate,
            weather: initialWeather,
            mood: initialMood,
            isFavorite: initialFavorite,
            mediaPaths: initialMedia
          }
        } catch (e: unknown) {
          logger.error('Failed to load diary', { error: e, dateStr })
          const fallbackConfig = await loadTemplateConfig()
          const fallback =
            entryTypeParam === 'daily_diary'
              ? resolveDiaryNewEntryContent(fallbackConfig, new Date())
              : ''
          setContent(fallback)
          initialStateRef.current = {
            content: fallback,
            title: '',
            selectedDate: initialDate,
            weather: '',
            mood: '',
            isFavorite: false,
            mediaPaths: []
          }
        } finally {
          if (!cancelled) setIsLoading(false)
        }
      } else if (!cancelled) {
        setIsLoading(false)
      }
    }

    void initEditor()

    return () => {
      cancelled = true
    }
  }, [dateStr, isAppendMode, parseInitialDate, loadTemplateConfig, fetchAttachmentDir])

  // 编辑器挂载并完成首轮同步后，以实际展示状态作为「未修改」基线
  useEffect(() => {
    if (isLoading) return

    let cancelled = false
    let rafId = 0

    const commitBaseline = () => {
      if (cancelled) return
      const snap = stateSnapshotRef.current
      initialStateRef.current = {
        content: snap.content,
        title: snap.title,
        selectedDate: snap.selectedDate,
        weather: snap.weather,
        mood: snap.mood,
        isFavorite: snap.isFavorite,
        mediaPaths: [...snap.mediaPaths]
      }
      setIsDirty(false)
    }

    rafId = requestAnimationFrame(() => {
      rafId = requestAnimationFrame(commitBaseline)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [isLoading, dateStr, isAppendMode])

  const autoSave = useCallback(
    async (newContent: string) => {
      if (!newContent.trim() && !diaryId && !title.trim()) return
      try {
        if (typeof window !== 'undefined' && (window as any).api?.diary) {
          const selectedDateStr = formatLocalDate(selectedDate)
          const { body } = parseDiaryEditorContent(newContent)

          const payload = {
            date: selectedDateStr,
            content: body,
            title:
              title.trim() ||
              body
                .replace(/^#{1,6}\s*/gm, '')
                .split('\n')[0]
                .substring(0, 50),
            slug: slug.trim() || undefined,
            entryType,
            authorRole,
            weather,
            mood,
            isFavorite,
            mediaPaths
          }

          const saved = await (window as any).api.diary.save(diaryId, payload)
          if (saved?.id && saved.id !== diaryId) {
            setDiaryId(saved.id)
          }
          setIsDirty(false)
          initialStateRef.current = {
            content: newContent,
            title,
            selectedDate,
            weather,
            mood,
            isFavorite,
            mediaPaths: [...mediaPaths]
          }
          return saved
        }
        setIsDirty(false)
        initialStateRef.current = {
          content: newContent,
          title,
          selectedDate,
          weather,
          mood,
          isFavorite,
          mediaPaths: [...mediaPaths]
        }
      } catch (e: unknown) {
        logger.error('Diary save failed', { error: e })
        throw e
      }
    },
    [selectedDate, weather, mood, isFavorite, diaryId, mediaPaths, title, slug, entryType, authorRole]
  )

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle)
    setIsDirty(true)
  }

  const handleContentChange = (newContent: string) => {
    setContent(newContent)
    const baseline = initialStateRef.current
    if (
      baseline &&
      normalizeDiaryContentForCompare(newContent) !==
        normalizeDiaryContentForCompare(baseline.content)
    ) {
      setIsDirty(true)
    }
  }

  const checkIsReallyDirty = (): boolean => {
    if (!initialStateRef.current) return false
    const init = initialStateRef.current

    if (title.trim() !== (init.title || '').trim()) {
      return true
    }
    if (
      normalizeDiaryContentForCompare(content) !== normalizeDiaryContentForCompare(init.content)
    ) {
      return true
    }
    if (weather !== init.weather) return true
    if (mood !== init.mood) return true
    if (isFavorite !== init.isFavorite) return true
    if (formatLocalDate(selectedDate) !== formatLocalDate(init.selectedDate)) return true

    const currentMediaSorted = [...mediaPaths].sort().join(',')
    const initMediaSorted = [...init.mediaPaths].sort().join(',')
    if (currentMediaSorted !== initMediaSorted) return true

    return false
  }

  /** idle → saving → leaving（退场动画）→ 导航 */
  const [savePhase, setSavePhase] = useState<'idle' | 'saving' | 'leaving'>('idle')

  // 当外部文件监听或 MCP 工具更新了当前正在查看的日记，且编辑器无未保存本地改动时，自动刷新正文与基线
  useEffect(() => {
    if (isLoading || savePhase !== 'idle') return
    const api = typeof window !== 'undefined' ? (window as any).api?.diary : undefined
    if (!api?.onSyncEvent || !api?.findByDate) return

    let cancelled = false
    const unsubscribe = api.onSyncEvent(
      (event: { type?: string; date?: string; entry?: { date?: string | Date } }) => {
        if (cancelled || event?.type === 'indexing-progress') return

        const snap = stateSnapshotRef.current
        const init = initialStateRef.current
        const currentEditorDate = formatLocalDate(snap.selectedDate)
        const eventDate =
          typeof event?.date === 'string' && event.date.trim()
            ? event.date.split('T')[0]!
            : event?.entry?.date
              ? formatLocalDate(safeParseDate(String(event.entry.date)))
              : null

        if (eventDate && eventDate !== currentEditorDate) return

        const isSnapshotDirty =
          init != null &&
          (normalizeDiaryContentForCompare(snap.content) !==
            normalizeDiaryContentForCompare(init.content) ||
            snap.weather !== init.weather ||
            snap.mood !== init.mood ||
            snap.isFavorite !== init.isFavorite ||
            formatLocalDate(snap.selectedDate) !== formatLocalDate(init.selectedDate) ||
            [...snap.mediaPaths].sort().join(',') !== [...init.mediaPaths].sort().join(','))

        if (isSnapshotDirty) return

        void (async () => {
          try {
            const diary = await api.findByDate(currentEditorDate)
            if (cancelled || !diary) return
            const parsedTags = normalizeDiaryTags(diary.tags)
            const parsedWeather = normalizeWeatherId(diary.weather || '') || ''
            const parsedMood = normalizeMoodId(diary.mood || '') || ''
            const nextContent = composeDiaryEditorContent(diary.content || '', parsedTags)
            const nextFavorite = diary.isFavorite || false
            const nextMedia = diary.mediaPaths || []

            const nextTitle = diary.title || ''
            setDiaryId(diary.id || null)
            setTitle(nextTitle)
            setWeather(parsedWeather)
            setMood(parsedMood)
            setIsFavorite(nextFavorite)
            setMediaPaths(nextMedia)
            setContent(nextContent)
            setIsDirty(false)
            initialStateRef.current = {
              content: nextContent,
              title: nextTitle,
              selectedDate: snap.selectedDate,
              weather: parsedWeather,
              mood: parsedMood,
              isFavorite: nextFavorite,
              mediaPaths: [...nextMedia]
            }
          } catch (e) {
            logger.warn('[useDiaryEditorPage] Reload after external sync event failed', {
              error: e
            })
          }
        })()
      }
    )

    return () => {
      cancelled = true
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [isLoading, savePhase])

  const goBackToSidebar = useCallback(() => {
    const lastNav = sessionStorage.getItem('desktop_last_nav')
    if (lastNav && lastNav !== '/diary') {
      navigate(lastNav)
    } else {
      navigate('/diary')
    }
  }, [navigate])

  const handleBack = async () => {
    if (savePhase !== 'idle') return
    if (checkIsReallyDirty()) {
      const ok = await dialog.confirm(
        t(
          'diary.editor_leave_confirm',
          '当前有尚未保存的文字，如果强行退出，将不会保存刚才键入的内容。确定要丢弃并离开吗？'
        ),
        t('common.confirm_leave', '确认离开')
      )
      if (!ok) return
    }
    goBackToSidebar()
  }

  const handleSave = async () => {
    if (savePhase !== 'idle') return
    setSavePhase('saving')
    try {
      await autoSave(content)
      toast.showSuccess(t('common.saved', '已保存'))
      setSavePhase('leaving')
      await new Promise((resolve) => setTimeout(resolve, 320))
      goBackToSidebar()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : undefined
      toast.showError(message || t('diary.save_failed', '保存失败，可能由于日期重复或系统错误'))
      setSavePhase('idle')
    }
  }

  const handleQuickSave = async () => {
    if (savePhase !== 'idle') return
    setSavePhase('saving')
    try {
      await autoSave(content)
      toast.showSuccess(t('common.saved', '已保存'))
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : undefined
      toast.showError(message || t('diary.save_failed', '保存失败，可能由于日期重复或系统错误'))
    } finally {
      setSavePhase('idle')
    }
  }

  const hasUnsavedChanges = !isLoading && (isDirty || checkIsReallyDirty())

  return {
    t,
    isLoading,
    attachmentBasePath,
    content,
    title,
    slug,
    entryType,
    authorRole,
    selectedDate,
    weather,
    mood,
    isFavorite,
    mediaPaths,
    isDirty: hasUnsavedChanges,
    isSaving: savePhase !== 'idle',
    savePhase,
    handleContentChange,
    handleTitleChange,
    handleBack,
    handleSave,
    handleQuickSave,
    goBackToSidebar,
    setSelectedDate,
    setWeather,
    setMood,
    setIsFavorite,
    setMediaPaths,
    setIsDirty
  }
}
