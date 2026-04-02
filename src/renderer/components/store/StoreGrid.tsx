/**
 * Store Grid
 *
 * Responsive grid layout of StoreCard components.
 * Handles empty/loading states for the grid area.
 * Supports paginated loading with "Load More" button.
 */

import { useAppsPageStore } from '../../stores/apps-page.store'
import { StoreCard } from './StoreCard'
import { CafeLogo } from '../brand/CafeLogo'
import { useTranslation } from '../../i18n'
import { Loader2 } from 'lucide-react'

export function StoreGrid(): JSX.Element {
  const { t } = useTranslation()
  const storeApps = useAppsPageStore(state => state.storeApps)
  const storeHasMore = useAppsPageStore(state => state.storeHasMore)
  const storeLoading = useAppsPageStore(state => state.storeLoading)
  const selectStoreApp = useAppsPageStore(state => state.selectStoreApp)
  const loadMoreStoreApps = useAppsPageStore(state => state.loadMoreStoreApps)

  if (storeApps.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center">
        <CafeLogo size={72} />
        <div>
          <p className="text-lg font-semibold text-foreground">
            {t('No apps found')}
          </p>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            {t('Try adjusting your search or filters')}
          </p>
          <p className="text-xs text-muted-foreground/80 mt-2">{t('没有找到合适的应用时，可以先切换分类，或用中英文关键词尝试搜索')}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
          <span className="pill-stat rounded-full px-3 py-1.5">{t('Search')}</span>
          <span className="pill-stat rounded-full px-3 py-1.5">{t('Filter')}</span>
          <span className="pill-stat rounded-full px-3 py-1.5">{t('Explore')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
        {storeApps.map((entry) => (
          <StoreCard
            key={entry.slug}
            entry={entry}
            onClick={() => { void selectStoreApp(entry.slug) }}
          />
        ))}
      </div>
      {storeHasMore && (
        <div className="flex justify-center pb-6">
          <button
            onClick={() => { void loadMoreStoreApps() }}
            disabled={storeLoading}
            className="px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2 panel-glass surface-subtle"
          >
            {storeLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : null}
            {t('Load more')}
          </button>
        </div>
      )}
    </div>
  )
}
