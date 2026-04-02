/**
 * Appearance Section Component
 * Manages theme and language settings
 */

import { useState, useCallback, useEffect } from 'react'
import type { CafeConfig, ThemeMode, SendKeyMode } from '../../types'
import { useTranslation, setLanguage, getCurrentLanguage, SUPPORTED_LOCALES, type LocaleCode } from '../../i18n'
import { api } from '../../api'
import { CafeLogo } from '../brand/CafeLogo'

interface AppearanceSectionProps {
  config: CafeConfig | null
  setConfig: (config: CafeConfig) => void
}

export function AppearanceSection({ config, setConfig }: AppearanceSectionProps): JSX.Element {
  const { t } = useTranslation()
  const savedTheme = config ? config.appearance.theme : 'system'
  const savedSendKeyMode = config?.chat?.sendKeyMode ?? 'enter'

  // Theme state
  const [theme, setTheme] = useState<ThemeMode>(savedTheme)

  // Send key mode state
  const [sendKeyMode, setSendKeyMode] = useState<SendKeyMode>(savedSendKeyMode)

  useEffect(() => {
    setTheme(savedTheme)
    setSendKeyMode(savedSendKeyMode)
  }, [savedTheme, savedSendKeyMode])

  // Auto-save helper for appearance settings
  const autoSave = useCallback(async (partialConfig: Partial<CafeConfig>) => {
    if (!config) return

    const newConfig = { ...config, ...partialConfig } as CafeConfig
    await api.setConfig(partialConfig)
    setConfig(newConfig)
  }, [config, setConfig])

  // Handle send key mode change with auto-save
  const handleSendKeyModeChange = async (value: SendKeyMode) => {
    setSendKeyMode(value)
    await autoSave({ chat: { ...config?.chat, sendKeyMode: value } })
  }

  // Handle theme change with auto-save
  const handleThemeChange = async (value: ThemeMode) => {
    setTheme(value)
    // Sync to localStorage immediately (for anti-flash on reload)
    try {
      localStorage.setItem('Cafe-theme', value)
    } catch { /* ignore */ }
    await autoSave({
      appearance: { theme: value }
    })
  }

  return (
      <section id="appearance" className="panel-glass section-frame rounded-[1.5rem] p-6">
      <div className="flex items-center gap-3 mb-4">
        <CafeLogo size={28} animated={false} />
        <div>
          <h2 className="text-lg font-medium">{t('Appearance')}</h2>
          <p className="text-sm text-muted-foreground">{t('Tune the theme, language, and chat input behavior for your workspace.')}</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Theme */}
        <div className="subsection-soft-panel p-4">
          <label className="block text-sm text-muted-foreground mb-2">{t('Theme')}</label>
          <div className="flex flex-wrap gap-3">
            {(['light', 'dark', 'system'] as ThemeMode[]).map((themeMode) => (
              <button
                key={themeMode}
                onClick={() => { void handleThemeChange(themeMode) }}
                className={`px-4 py-2 rounded-xl transition-colors ${
                  theme === themeMode
                    ? 'toolbar-chip toolbar-chip-active text-primary border border-primary/60'
                    : 'toolbar-chip surface-subtle hover:bg-secondary'
                }`}
              >
                {themeMode === 'light' ? t('Light') : themeMode === 'dark' ? t('Dark') : t('Follow System')}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="subsection-soft-panel p-4">
          <label className="block text-sm text-muted-foreground mb-2">{t('Language')}</label>
          <select
            value={getCurrentLanguage()}
            onChange={(e) => setLanguage(e.target.value as LocaleCode)}
            className="form-input-soft w-full px-4 py-2.5 transition-colors"
          >
            {Object.entries(SUPPORTED_LOCALES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* Send Key */}
        <div className="subsection-soft-panel p-4">
          <label className="block text-sm text-muted-foreground mb-2">{t('Send Key')}</label>
          <div className="flex flex-wrap gap-3">
            {(['enter', 'ctrl-enter'] as SendKeyMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => { void handleSendKeyModeChange(mode) }}
                className={`px-4 py-2 rounded-xl transition-colors ${
                  sendKeyMode === mode
                    ? 'toolbar-chip toolbar-chip-active text-primary border border-primary/60'
                    : 'toolbar-chip surface-subtle hover:bg-secondary'
                }`}
              >
                {mode === 'enter' ? t('Enter') : t('Ctrl+Enter')}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {sendKeyMode === 'enter' ? t('Press Enter to send, Shift+Enter for new line') : t('Press Ctrl+Enter to send, Enter for new line')}
          </p>
        </div>
      </div>
    </section>
  )
}
