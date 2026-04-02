/**
 * About Section Component
 * Displays version info, update status, and resource links
 */

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { api } from '../../api'
import type { UpdateStatus } from './types'
import { CafeLogo } from '../brand/CafeLogo'

declare const __BUILD_TIME__: string

const DOCS_URL = 'https://github.com/kael-odin/cafe-ai#readme'
const FEEDBACK_URL = 'https://github.com/kael-odin/cafe-ai/issues'

const handleOpenLink = async (url: string) => {
  try {
    await api.openExternal(url)
  } catch {
    window.open(url, '_blank')
  }
}

export function AboutSection(): JSX.Element {
  const { t } = useTranslation()

  // App version state
  const [appVersion, setAppVersion] = useState<string>('')

  // Update check state
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    checking: false,
    hasUpdate: false,
    upToDate: false
  })

  // Load app version
  useEffect(() => {
    void api.getVersion().then((result) => {
      if (result.success && result.data) {
        setAppVersion(result.data)
      }
    })
  }, [])

  // Listen for update status
  useEffect(() => {
    const unsubscribe = api.onUpdaterStatus((data) => {
      if (data.status === 'checking') {
        setUpdateStatus({ checking: true, hasUpdate: false, upToDate: false })
      } else if (data.status === 'not-available') {
        setUpdateStatus({ checking: false, hasUpdate: false, upToDate: true })
      } else if (data.status === 'manual-download' || data.status === 'available' || data.status === 'downloaded') {
        setUpdateStatus({ checking: false, hasUpdate: true, upToDate: false, version: data.version })
      } else if (data.status === 'error') {
        setUpdateStatus({ checking: false, hasUpdate: false, upToDate: false })
      } else {
        setUpdateStatus(prev => ({ ...prev, checking: false }))
      }
    })
    return () => unsubscribe()
  }, [])

  // Handle check for updates
  const handleCheckForUpdates = async (): Promise<void> => {
    setUpdateStatus({ checking: true, hasUpdate: false, upToDate: false })
    await api.checkForUpdates()
  }

  return (
    <section id="about" className="panel-glass section-frame rounded-[1.5rem] p-6 relative overflow-hidden">
      <span className="sakura-petal sakura-petal-sm sakura-float-b right-6 top-5" />
      <div className="flex items-center gap-3 mb-4">
        <CafeLogo size={28} animated={false} />
        <div>
          <h2 className="text-lg font-medium">{t('About')}</h2>
          <p className="text-sm text-muted-foreground">{t('Version, updates, and quick links for the Cafe workspace.')}</p>
        </div>
      </div>

      <div className="space-y-3 text-sm">
        <div className="subsection-soft-panel p-4 flex justify-between items-center gap-4">
          <span className="text-muted-foreground">{t('Version')}</span>
          <div className="flex items-center gap-3">
            <span>{appVersion ? `${appVersion} (${__BUILD_TIME__.replace(/T(\d{2}):(\d{2}).*/, '-$1$2')})` : '-'}</span>
            <button
              onClick={() => { void handleCheckForUpdates() }}
              disabled={updateStatus.checking}
              className="text-xs px-3 py-1.5 rounded-xl surface-subtle text-primary hover:text-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {updateStatus.checking ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t('Checking...')}
                </span>
              ) : updateStatus.hasUpdate ? (
                <span className="text-emerald-500">{t('New version available')}: {updateStatus.version}</span>
              ) : updateStatus.upToDate ? (
                <span className="text-muted-foreground">{t('Already up to date')}</span>
              ) : (
                t('Check for updates')
              )}
            </button>
          </div>
        </div>

        <div className="subsection-soft-panel p-4 flex justify-between">
          <span className="text-muted-foreground">{t('Build')}</span>
          <span>Powered by Claude Code</span>
        </div>

        {/* Resource links */}
        <div className="subsection-soft-panel p-4 flex justify-between items-center">
          <span className="text-muted-foreground">{t('Help')}</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { void handleOpenLink(DOCS_URL) }}
              className="text-xs px-3 py-1.5 rounded-xl surface-subtle text-primary hover:text-primary/80 transition-colors"
            >
              {t('Docs')}
            </button>
            <button
              onClick={() => { void handleOpenLink(FEEDBACK_URL) }}
              className="text-xs px-3 py-1.5 rounded-xl surface-subtle text-primary hover:text-primary/80 transition-colors"
            >
              {t('Feedback')}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
