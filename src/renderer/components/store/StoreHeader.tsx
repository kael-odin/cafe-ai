/**
 * Store Header
 *
 * Search input, type filter tabs, and category filter chips for the store.
 * Provides real-time filtering as user types or selects categories.
 */

import { useCallback, useEffect, useRef } from 'react'
import { Search, RefreshCw } from 'lucide-react'
import { useAppsPageStore } from '../../stores/apps-page.store'
import { STORE_CATEGORY_META } from '../../../shared/store/store-types'
import { CafeLogomark } from '../brand/CafeLogo'
import { useTranslation } from '../../i18n'
import type { AppType } from '../../../shared/apps/spec-types'

const TYPE_FILTERS: Array<{ id: AppType | null; labelKey: string }> = [
  { id: null, labelKey: 'All' },
  { id: 'automation', labelKey: 'Digital Human' },
  { id: 'skill', labelKey: 'Skill' },
  { id: 'mcp', labelKey: 'MCP' },
]

// Registry source filters (shown as separate tabs)
const REGISTRY_FILTERS: Array<{ id: string; labelKey: string }> = [
  { id: 'skillshub', labelKey: 'SkillsHub' },
  { id: 'clawhub', labelKey: 'ClawHub' },
]

export function StoreHeader(): JSX.Element {
  const { t } = useTranslation()
  const storeSearchQuery = useAppsPageStore(state => state.storeSearchQuery)
  const storeCategory = useAppsPageStore(state => state.storeCategory)
  const storeTypeFilter = useAppsPageStore(state => state.storeTypeFilter)
  const storeRegistryFilter = useAppsPageStore(state => state.storeRegistryFilter)
  const storeLoading = useAppsPageStore(state => state.storeLoading)
  const setStoreSearch = useAppsPageStore(state => state.setStoreSearch)
  const setStoreCategory = useAppsPageStore(state => state.setStoreCategory)
  const setStoreTypeFilter = useAppsPageStore(state => state.setStoreTypeFilter)
  const setStoreRegistryFilter = useAppsPageStore(state => state.setStoreRegistryFilter)
  const loadStoreApps = useAppsPageStore(state => state.loadStoreApps)
  const refreshStore = useAppsPageStore(state => state.refreshStore)

  // Debounce timer ref for search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced search: triggers loadStoreApps 300ms after typing stops
  const handleSearchChange = useCallback((value: string) => {
    setStoreSearch(value)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      const state = useAppsPageStore.getState()
      void loadStoreApps({ search: value || undefined, category: state.storeCategory ?? undefined, type: state.storeTypeFilter ?? undefined })
    }, 300)
  }, [setStoreSearch, loadStoreApps])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  // Type filter click triggers immediate filter
  const handleTypeFilterClick = useCallback((typeId: string | null) => {
    setStoreTypeFilter(typeId)
    const state = useAppsPageStore.getState()
    void loadStoreApps({
      search: state.storeSearchQuery || undefined,
      category: state.storeCategory ?? undefined,
      type: typeId ?? undefined,
    })
  }, [setStoreTypeFilter, loadStoreApps])

  // Category click triggers immediate filter
  const handleCategoryClick = useCallback((categoryId: string | null) => {
    setStoreCategory(categoryId)
    const state = useAppsPageStore.getState()
    void loadStoreApps({
      search: state.storeSearchQuery || undefined,
      category: categoryId ?? undefined,
      type: state.storeTypeFilter ?? undefined,
    })
  }, [setStoreCategory, loadStoreApps])

  // Registry filter click (SkillsHub/ClawHub)
  const handleRegistryFilterClick = useCallback((registryId: string | null) => {
    setStoreRegistryFilter(registryId)
    setStoreTypeFilter(registryId ? 'skill' : null)  // Force skill type for these registries
    const state = useAppsPageStore.getState()
    void loadStoreApps({
      search: state.storeSearchQuery || undefined,
      category: state.storeCategory ?? undefined,
      type: registryId ? 'skill' : (state.storeTypeFilter ?? undefined),
      registryId: registryId ?? undefined,
    })
  }, [setStoreRegistryFilter, setStoreTypeFilter, loadStoreApps])

  return (
    <div className="flex flex-col gap-3 px-4 py-4 border-b border-border/70 flex-shrink-0 bg-background/20 relative overflow-hidden">
      <span className="sakura-petal sakura-petal-sm sakura-float-a right-8 top-4" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <CafeLogo size={30} animated={false} />
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">{t('Discover')}</div>
            <h3 className="text-base font-semibold text-foreground">{t('App Store')}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('适合中文与英文工作流的应用市场 / Browse apps for your workflow')}
            </p>
          </div>
        </div>
        <button
          onClick={() => { void refreshStore() }}
          disabled={storeLoading}
          className="p-2.5 text-muted-foreground hover:text-foreground surface-subtle rounded-xl transition-colors disabled:opacity-50"
          title={t('Refresh')}
        >
          <RefreshCw className={`w-4 h-4 ${storeLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search + Refresh row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={storeSearchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder={t('Search apps...')}
            className="form-input-soft w-full pl-9 pr-3 py-2.5 text-sm placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Type filter tabs */}
      <div className="flex items-center gap-1">
        {TYPE_FILTERS.map(tf => (
          <button
            key={String(tf.id)}
            onClick={() => handleTypeFilterClick(tf.id)}
            className={`flex-shrink-0 px-3 py-1.5 text-xs rounded-xl transition-colors ${
              storeTypeFilter === tf.id && !storeRegistryFilter
                ? 'toolbar-chip toolbar-chip-active font-medium'
                : 'toolbar-chip text-muted-foreground hover:text-foreground'
            }`}
          >
            {t(tf.labelKey)}
          </button>
        ))}
      </div>

      {/* Registry source tabs (SkillsHub/ClawHub) */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground mr-1">{t('Sources')}:</span>
        {REGISTRY_FILTERS.map(rf => (
          <button
            key={rf.id}
            onClick={() => handleRegistryFilterClick(rf.id)}
            className={`flex-shrink-0 px-3 py-1.5 text-xs rounded-xl transition-colors ${
              storeRegistryFilter === rf.id
                ? 'toolbar-chip toolbar-chip-active font-medium'
                : 'toolbar-chip text-muted-foreground hover:text-foreground'
            }`}
          >
            {t(rf.labelKey)}
          </button>
        ))}
      </div>

      {/* Category chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
        <button
          onClick={() => handleCategoryClick(null)}
            className={`flex-shrink-0 px-2.5 py-1.5 text-xs rounded-xl transition-colors ${
              storeCategory === null
                ? 'toolbar-chip toolbar-chip-active text-foreground font-medium'
                : 'toolbar-chip text-muted-foreground hover:text-foreground'
            }`}
        >
          {t('All')}
        </button>
        {STORE_CATEGORY_META.map(cat => (
          <button
            key={cat.id}
            onClick={() => handleCategoryClick(cat.id)}
            className={`flex-shrink-0 px-2.5 py-1.5 text-xs rounded-xl transition-colors ${
              storeCategory === cat.id
                ? 'toolbar-chip toolbar-chip-active text-foreground font-medium'
                : 'toolbar-chip text-muted-foreground hover:text-foreground'
            }`}
          >
            {cat.icon} {t(cat.labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}
