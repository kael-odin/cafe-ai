/**
 * Store View
 *
 * Main container for the App Store tab. Handles layout coordination
 * between the header (search/filter), grid/detail views, and install dialog.
 */

import { useEffect, useRef } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { useAppsPageStore } from '../../stores/apps-page.store'
import { CafeLogo } from '../brand/CafeLogo'
import { StoreHeader } from './StoreHeader'
import { StoreGrid } from './StoreGrid'
import { StoreDetail } from './StoreDetail'
import { useTranslation } from '../../i18n'

export function StoreView(): JSX.Element {
  const { t } = useTranslation()
  const storeLoading = useAppsPageStore(state => state.storeLoading)
  const storeError = useAppsPageStore(state => state.storeError)
  const storeSelectedSlug = useAppsPageStore(state => state.storeSelectedSlug)
  const storeApps = useAppsPageStore(state => state.storeApps)
  const loadStoreApps = useAppsPageStore(state => state.loadStoreApps)
  const checkUpdates = useAppsPageStore(state => state.checkUpdates)
  const didInitRef = useRef(false)

  // Load store apps and update badges on mount.
  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true

    if (storeApps.length === 0) {
      void loadStoreApps()
    }
    void checkUpdates()
  }, [storeApps.length, loadStoreApps, checkUpdates])

  // Error state
  if (storeError && !storeLoading && storeApps.length === 0) {
    return (
      <div className="flex-1 flex flex-col panel-glass rounded-[1.5rem] overflow-hidden">
        <StoreHeader />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="relative">
            <CafeLogo size={62} />
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl bg-red-500/12 border border-red-500/20 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-red-400" />
            </div>
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">
              {t('Failed to load store')}
            </p>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              {storeError}
            </p>
          </div>
          <button
            onClick={() => { void loadStoreApps() }}
            className="px-4 py-2.5 text-sm btn-primary text-primary-foreground rounded-xl"
          >
            {t('Retry')}
          </button>
        </div>
      </div>
    )
  }

  // Loading state (initial load only)
  if (storeLoading && storeApps.length === 0) {
    return (
      <div className="flex-1 flex flex-col panel-glass rounded-[1.5rem] overflow-hidden">
        <StoreHeader />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <CafeLogo size={56} />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t('Loading store...')}</span>
          </div>
        </div>
      </div>
    )
  }

  // Detail view
  if (storeSelectedSlug) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden panel-glass rounded-[1.5rem]">
        <StoreDetail />
      </div>
    )
  }

  // Grid view
  return (
    <div className="flex-1 flex flex-col overflow-hidden panel-glass rounded-[1.5rem]">
      <StoreHeader />
      <div className="flex-1 overflow-y-auto">
        <StoreGrid />
      </div>
    </div>
  )
}
