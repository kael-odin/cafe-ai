/**
 * Settings Page - App configuration
 * Modular design with left sidebar navigation and right content area
 */

import { useState, useCallback } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useAppStore } from '../stores/app.store'
import { api } from '../api'
import type { CafeConfig } from '../types'
import { CafeLogo } from '../components/brand/CafeLogo'
import { Header } from '../components/layout/Header'
import { useTranslation } from '../i18n'
import { useIsMobile } from '../hooks/useIsMobile'

// Import modular settings components
import {
  SettingsNav,
  scrollToSection,
  AISourcesSection,
  AppearanceSection,
  SystemSection,
  AdvancedSection,
  RemoteAccessSection,
  AboutSection,
  MessageChannelsSection,
  RegistrySection,
  RecommendSection
} from '../components/settings'

export function SettingsPage(): JSX.Element {
  const { t } = useTranslation()
  const { config, setConfig, goBack } = useAppStore()
  const isMobile = useIsMobile()
  const isRemoteMode = api.isRemoteMode()

  // Active navigation section (click-only, no scroll spy - standard settings page behavior)
  const [activeSection, setActiveSection] = useState('ai-model')

  // Handle navigation click
  const handleNavClick = useCallback((sectionId: string) => {
    setActiveSection(sectionId)
    scrollToSection(sectionId)
  }, [])

  // Handle back - return to previous view
  const handleBack = () => {
    goBack()
  }

  return (
    <div className="h-full w-full flex flex-col app-shell">
      {/* Header */}
      <Header
        left={
          <>
            <button
              onClick={handleBack}
              className="p-1.5 hover:bg-secondary rounded-lg transition-colors surface-subtle"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <CafeLogo size={26} animated={false} />
            <div className="flex flex-col leading-none">
              <span className="font-medium text-sm">{t('Settings')}</span>
              <span className="text-[11px] text-muted-foreground/80">{t('Theme, model, remote access, and store')}</span>
            </div>
          </>
        }
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Navigation - Desktop only */}
        {!isMobile && (
          <SettingsNav
            isRemoteMode={isRemoteMode}
            activeSection={activeSection}
            onSectionChange={handleNavClick}
          />
        )}

        {/* Right Content Area */}
        <main className="flex-1 overflow-auto">
          {/* Mobile Navigation Dropdown */}
          {isMobile && (
            <SettingsNav
              isRemoteMode={isRemoteMode}
              activeSection={activeSection}
              onSectionChange={handleNavClick}
            />
          )}

          {/* Scrollable Content */}
          <div className="p-6 md:p-8">
            <div className="max-w-2xl mx-auto space-y-6">
              {/* AI Sources Section (v2) */}
              <AISourcesSection config={config as CafeConfig} setConfig={setConfig} />

              {/* Message Channels Section */}
              <MessageChannelsSection config={config} setConfig={setConfig} />

              {/* App Store Registry Section */}
              <RegistrySection />

              {/* Appearance Section */}
              <AppearanceSection config={config} setConfig={setConfig} />

              {/* System Section - Desktop only */}
              {!isRemoteMode && (
                <SystemSection config={config} setConfig={setConfig} />
              )}

              {/* Advanced Section - Desktop only */}
              {!isRemoteMode && (
                <AdvancedSection config={config} setConfig={setConfig} />
              )}

              {/* Remote Access Section - Desktop only */}
              {!isRemoteMode && (
                <RemoteAccessSection />
              )}

              {/* Recommend Section */}
              <RecommendSection />

              {/* About Section */}
              <AboutSection />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
