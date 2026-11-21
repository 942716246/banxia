import React from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { Search, Plus, Edit3, CalendarCheck, Filter, X, Heart } from 'lucide-react'
import {
  WEATHER_IDS,
  getWeatherEmoji,
  weatherI18nKey,
  MOOD_IDS,
  getMoodEmoji,
  getMoodLabelFallback,
  moodI18nKey,
  type WeatherId,
  type MoodId
} from '@baishou/shared'
import { Input, YearMonthPicker } from '@baishou/ui'
import { motion, AnimatePresence } from 'framer-motion'

interface DiaryAppBarProps {
  searchQuery: string
  onSearchChange: (q: string) => void
  selectedMonth: Date | null
  onMonthChange: (m: Date | null) => void
  filterWeathers: string[]
  onFilterWeathersChange: (weathers: string[]) => void
  filterMoods: string[]
  onFilterMoodsChange: (moods: string[]) => void
  filterFavorite: boolean
  onFilterFavoriteChange: (v: boolean) => void
  todayEntry: { id: number } | null
  onEditToday: () => void
  onAddNew: () => void
  activeTab?: 'daily_diary' | 'banxia_essay' | 'novel_archive'
  onTabChange?: (tab: 'daily_diary' | 'banxia_essay' | 'novel_archive') => void
}

/** 日记页面顶部工具栏：包含月份选择、天气/收藏筛选面板、搜索框与操作按钮 */
export const DiaryAppBar: React.FC<DiaryAppBarProps> = ({
  searchQuery,
  onSearchChange,
  selectedMonth,
  onMonthChange,
  filterWeathers,
  onFilterWeathersChange,
  filterMoods,
  onFilterMoodsChange,
  filterFavorite,
  onFilterFavoriteChange,
  todayEntry,
  onEditToday,
  onAddNew,
  activeTab = 'daily_diary',
  onTabChange
}) => {
  const { t } = useTranslation()
  const location = useLocation()
  const [isFilterOpen, setIsFilterOpen] = React.useState(false)
  const filterRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setIsFilterOpen(false)
  }, [location.pathname])

  const hasActiveFilters = filterWeathers.length > 0 || filterMoods.length > 0 || filterFavorite

  const weatherLabelFallback: Record<WeatherId, string> = {
    sunny: t('auto.apps.desktop.src.renderer.src.features.diary.components.DiaryAppBar.L63', '晴'),
    cloudy: t(
      'auto.apps.desktop.src.renderer.src.features.diary.components.DiaryAppBar.L64',
      '多云'
    ),
    overcast: t(
      'auto.apps.desktop.src.renderer.src.features.diary.components.DiaryAppBar.L65',
      '阴'
    ),
    light_rain: t(
      'auto.apps.desktop.src.renderer.src.features.diary.components.DiaryAppBar.L66',
      '小雨'
    ),
    heavy_rain: t(
      'auto.apps.desktop.src.renderer.src.features.diary.components.DiaryAppBar.L67',
      '大雨'
    ),
    snow: t('auto.apps.desktop.src.renderer.src.features.diary.components.DiaryAppBar.L68', '雪'),
    fog: t('auto.apps.desktop.src.renderer.src.features.diary.components.DiaryAppBar.L69', '雾'),
    windy: t('auto.apps.desktop.src.renderer.src.features.diary.components.DiaryAppBar.L70', '风')
  }

  const getWeatherLabel = (id: WeatherId) =>
    t(`diary.weather.${weatherI18nKey(id)}`, weatherLabelFallback[id])

  const getMoodLabel = (id: MoodId) => t(`diary.mood.${moodI18nKey(id)}`, getMoodLabelFallback(id))

  const clearFilters = () => {
    onFilterWeathersChange([])
    onFilterMoodsChange([])
    onFilterFavoriteChange(false)
  }

  return (
    <div className="diary-appbar">
      <div className="diary-appbar-left">
        {/* 三抽屉切换标签页 */}
        <div
          className="diary-tab-switcher"
          style={{
            display: 'flex',
            gap: '4px',
            background: 'rgba(0,0,0,0.04)',
            padding: '3px',
            borderRadius: '8px'
          }}
        >
          <button
            type="button"
            className={`diary-tab-btn ${activeTab === 'daily_diary' ? 'active' : ''}`}
            onClick={() => onTabChange?.('daily_diary')}
            style={{
              border: 'none',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: activeTab === 'daily_diary' ? 600 : 400,
              background: activeTab === 'daily_diary' ? 'var(--bg-primary, #fff)' : 'transparent',
              boxShadow: activeTab === 'daily_diary' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              color:
                activeTab === 'daily_diary'
                  ? 'var(--text-primary, #333)'
                  : 'var(--text-secondary, #666)',
              cursor: 'pointer'
            }}
          >
            📖 日常日记
          </button>
          <button
            type="button"
            className={`diary-tab-btn ${activeTab === 'banxia_essay' ? 'active' : ''}`}
            onClick={() => onTabChange?.('banxia_essay')}
            style={{
              border: 'none',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: activeTab === 'banxia_essay' ? 600 : 400,
              background: activeTab === 'banxia_essay' ? 'var(--bg-primary, #fff)' : 'transparent',
              boxShadow: activeTab === 'banxia_essay' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              color:
                activeTab === 'banxia_essay'
                  ? 'var(--text-primary, #333)'
                  : 'var(--text-secondary, #666)',
              cursor: 'pointer'
            }}
          >
            🎨 半夏随笔
          </button>
          <button
            type="button"
            className={`diary-tab-btn ${activeTab === 'novel_archive' ? 'active' : ''}`}
            onClick={() => onTabChange?.('novel_archive')}
            style={{
              border: 'none',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: activeTab === 'novel_archive' ? 600 : 400,
              background:
                activeTab === 'novel_archive' ? 'var(--bg-primary, #fff)' : 'transparent',
              boxShadow: activeTab === 'novel_archive' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              color:
                activeTab === 'novel_archive'
                  ? 'var(--text-primary, #333)'
                  : 'var(--text-secondary, #666)',
              cursor: 'pointer'
            }}
          >
            📜 小说档案
          </button>
        </div>

        {activeTab === 'daily_diary' && (
          <div className="diary-month-selector">
            <YearMonthPicker
              selectedMonth={selectedMonth}
              onChange={onMonthChange}
              titlePlaceholder={t('diary.all_diaries', '全部日记')}
            />
          </div>
        )}

        {/* 筛选按钮 */}
        <div className="diary-filter-wrapper" ref={filterRef}>
          <button
            className={`diary-filter-btn ${hasActiveFilters ? 'active' : ''}`}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
          >
            <Filter size={16} />
            {hasActiveFilters && <span className="diary-filter-badge" />}
          </button>

          {/* 筛选遮罩层 */}
          <AnimatePresence>
            {isFilterOpen && (
              <motion.div
                className="diary-filter-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={() => setIsFilterOpen(false)}
              />
            )}
          </AnimatePresence>

          {/* 筛选面板 */}
          <AnimatePresence>
            {isFilterOpen && (
              <motion.div
                className="diary-filter-panel"
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="diary-filter-header">
                  <span className="diary-filter-title">{t('diary.filter', '筛选')}</span>
                  {hasActiveFilters && (
                    <button
                      className="diary-filter-clear"
                      onClick={(e) => {
                        e.stopPropagation()
                        clearFilters()
                      }}
                    >
                      <X size={14} />
                      {t('diary.clear_filter', '清除')}
                    </button>
                  )}
                </div>

                {/* 收藏筛选 */}
                <div className="diary-filter-section">
                  <button
                    className={`diary-filter-option ${filterFavorite ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onFilterFavoriteChange(!filterFavorite)
                    }}
                  >
                    <Heart size={16} fill={filterFavorite ? 'currentColor' : 'none'} />
                    <span>{t('diary.filter_favorite', '收藏')}</span>
                  </button>
                </div>

                {/* 天气筛选 */}
                <div className="diary-filter-section">
                  <div className="diary-filter-section-label">
                    {t('diary.filter_weather', '天气')}
                  </div>
                  <div className="diary-filter-weather-grid">
                    {WEATHER_IDS.map((weather) => (
                      <button
                        key={weather}
                        className={`diary-filter-weather-btn ${filterWeathers.includes(weather) ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onFilterWeathersChange(
                            filterWeathers.includes(weather)
                              ? filterWeathers.filter((w) => w !== weather)
                              : [...filterWeathers, weather]
                          )
                        }}
                        title={getWeatherLabel(weather)}
                        aria-label={getWeatherLabel(weather)}
                      >
                        <span className="diary-filter-weather-emoji">
                          {getWeatherEmoji(weather)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 心情筛选 */}
                <div className="diary-filter-section">
                  <div className="diary-filter-section-label">{t('diary.filter_mood', '心情')}</div>
                  <div className="diary-filter-weather-grid">
                    {MOOD_IDS.map((mood) => (
                      <button
                        key={mood}
                        className={`diary-filter-weather-btn ${filterMoods.includes(mood) ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onFilterMoodsChange(
                            filterMoods.includes(mood)
                              ? filterMoods.filter((m) => m !== mood)
                              : [...filterMoods, mood]
                          )
                        }}
                        title={getMoodLabel(mood)}
                        aria-label={getMoodLabel(mood)}
                      >
                        <span className="diary-filter-weather-emoji">{getMoodEmoji(mood)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="diary-appbar-right">
        <div className="diary-search-wrapper">
          <Search size={16} className="diary-search-icon" />
          <Input
            fieldSize="small"
            type="text"
            inputClassName="diary-search-input"
            placeholder={t('common.search_hint', '搜索记忆...')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {activeTab === 'daily_diary' && (
          <button
            className="diary-today-btn"
            onClick={onEditToday}
            title={
              todayEntry
                ? t('settings.edit_today_tooltip', '编辑今日记录')
                : t('settings.write_today_tooltip', '记录今天')
            }
          >
            {todayEntry ? <Edit3 size={20} /> : <CalendarCheck size={20} />}
          </button>
        )}

        <button className="diary-add-btn" onClick={onAddNew}>
          <Plus size={18} />
          {activeTab === 'banxia_essay'
            ? '写随笔'
            : activeTab === 'novel_archive'
              ? '存档案'
              : t('settings.write_diary_button', '写日记')}
        </button>
      </div>
    </div>
  )
}
