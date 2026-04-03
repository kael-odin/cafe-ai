/**
 * Apps Page
 *
 * Top-level page for the Apps system. Accessible from SpacePage header.
 * Layout: Header + tab bar + split pane (app list sidebar | detail area).
 * Mobile: Full-screen detail view with swipe-back gesture.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../stores/app.store'
import { useSpaceStore } from '../stores/space.store'
import { useAppsStore } from '../stores/apps.store'
import { useAppsPageStore } from '../stores/apps-page.store'
import { Header } from '../components/layout/Header'
import { CafeLogo } from '../components/brand/CafeLogo'
import { AppList } from '../components/apps/AppList'
import { AutomationHeader } from '../components/apps/AutomationHeader'
import { LoginNoticeBar } from '../components/apps/LoginNoticeBar'
import { ActivityThread } from '../components/apps/ActivityThread'
import { SessionDetailView } from '../components/apps/SessionDetailView'
import { AppChatView } from '../components/apps/AppChatView'
import { AppConfigPanel } from '../components/apps/AppConfigPanel'
import { McpStatusCard } from '../components/apps/McpStatusCard'
import { SkillInfoCard } from '../components/apps/SkillInfoCard'
import { EmptyState } from '../components/apps/EmptyState'
import { AppInstallDialog } from '../components/apps/AppInstallDialog'
import { ManualAddDialog } from '../components/apps/ManualAddDialog'
import { SkillInstallDialog } from '../components/apps/SkillInstallDialog'
import { UninstalledDetailView } from '../components/apps/UninstalledDetailView'
import { StoreView } from '../components/store/StoreView'
import { ContentCanvas } from '../components/canvas'
import { useCanvasIsOpen, useCanvasStore } from '../stores/canvas.store'
import { canvasLifecycle } from '../services/canvas-lifecycle'
import { useTranslation, getCurrentLanguage } from '../i18n'
import { resolveSpecI18n } from '../utils/spec-i18n'
import { api } from '../api'
import { ChevronLeft, ChevronRight, Settings, ArrowLeft } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'
import { useSwipeBack } from '../hooks/useSwipeBack'

export function AppsPage(): JSX.Element {
  const { t } = useTranslation()
  const { setView, previousView } = useAppStore()
  const currentSpace = useSpaceStore(state => state.currentSpace)
  const CafeSpace = useSpaceStore(state => state.CafeSpace)
  const spaces = useSpaceStore(state => state.spaces)
  const { apps, loadApps, updateAppOverrides } = useAppsStore()
  const {
    currentTab,
    setCurrentTab,
    selectedAppId,
    detailView,
    initialAppId,
    showInstallDialog,
    selectApp,
    clearSelection,
    openActivityThread,
    setInitialAppId,
    setShowInstallDialog,
  } = useAppsPageStore()

  const [showManualAddDialog, setShowManualAddDialog] = useState(false)
  const [showSkillInstallDialog, setShowSkillInstallDialog] = useState(false)
  const isMobile = useIsMobile()

  const handleBack = () => {
    setView(currentSpace ? 'space' : (previousView ?? 'home'))
  }
  const { bind: bindSwipeBack } = useSwipeBack(handleBack)

  /** Types that belong to the "My Apps" tab */
  const NON_AUTOMATION_TYPES = useMemo(() => new Set(['mcp', 'skill', 'extension']), [])

  /** Filter apps visible in the current tab (excludes store tab) */
  const appsForCurrentTab = useMemo(() => {
    return apps.filter(a => {
      const isNonAutomation = NON_AUTOMATION_TYPES.has(a.spec.type)
      return currentTab === 'my-apps' ? isNonAutomation : !isNonAutomation
    })
  }, [apps, currentTab, NON_AUTOMATION_TYPES])

  // Load all apps globally (across all spaces) on mount
  useEffect(() => {
    void loadApps()
  }, [loadApps])

  // Build spaceId -> space name map for display
  // Always populate from both CafeSpace and dedicated spaces
  const spaceMap = useMemo(() => {
    const map: Record<string, string> = {}
    if (CafeSpace) map[CafeSpace.id] = CafeSpace.name
    for (const s of spaces) {
      map[s.id] = s.name
    }
    return map
  }, [spaces, CafeSpace])

  // Auto-select initial app (from notification/badge navigation)
  useEffect(() => {
    if (initialAppId && apps.length > 0) {
      const app = apps.find(a => a.id === initialAppId)
      if (app) {
        // Switch to the correct tab for this app type
        const isNonAutomation = NON_AUTOMATION_TYPES.has(app.spec.type)
        const targetTab = isNonAutomation ? 'my-apps' : 'my-digital-humans'
        if (currentTab !== targetTab) setCurrentTab(targetTab)
        selectApp(app.id, app.status === 'uninstalled' ? 'uninstalled' : app.spec.type)
        setInitialAppId(null)
      }
    }
  }, [apps, initialAppId, selectApp, setInitialAppId, currentTab, setCurrentTab, NON_AUTOMATION_TYPES])

  // Clear selection when switching between split-layout tabs
  const prevTabRef = useRef(currentTab)
  useEffect(() => {
    const prev = prevTabRef.current
    prevTabRef.current = currentTab
    // Only clear when switching between the two list tabs (not to/from store)
    if (prev !== currentTab && prev !== 'store' && currentTab !== 'store') {
      clearSelection()
    }
  }, [currentTab, clearSelection])

  // Auto-select first app for the current tab if nothing selected
  useEffect(() => {
    if (currentTab === 'store') return
    if (!selectedAppId && appsForCurrentTab.length > 0) {
      const activeApps = appsForCurrentTab.filter(a => a.status !== 'uninstalled')
      const waitingApp = activeApps.find(a => a.status === 'waiting_user')
      const firstApp = waitingApp ?? activeApps.at(0) ?? appsForCurrentTab[0]
      selectApp(firstApp.id, firstApp.status === 'uninstalled' ? 'uninstalled' : firstApp.spec.type)
    }
  }, [appsForCurrentTab, selectedAppId, selectApp, currentTab])

  // Resolve the selected app (for breadcrumb and detail panel)
  const selectedApp = useMemo(
    () => apps.find(a => a.id === selectedAppId),
    [apps, selectedAppId]
  )

  // Locale-resolved display fields for breadcrumbs and login notice
  const resolvedSpec = useMemo(
    () => selectedApp ? resolveSpecI18n(selectedApp.spec, getCurrentLanguage()) : undefined,
    [selectedApp]
  )
  const selectedAppName = resolvedSpec?.name

  // Login notice bar: show when browser_login exists and not dismissed
  const showLoginNotice = useMemo(() => {
    if (!selectedApp || selectedApp.spec.type !== 'automation') return false
    const browserLogin = resolvedSpec?.browser_login
    if (browserLogin == null || browserLogin.length === 0) return false
    return !selectedApp.userOverrides?.loginNoticeDismissed
  }, [selectedApp, resolvedSpec])

  const isSessionDetail = detailView?.type === 'session-detail'
  const isAppChat = detailView?.type === 'app-chat'
  const isUninstalledDetail = detailView?.type === 'uninstalled-detail'
  const isCanvasOpen = useCanvasIsOpen()
  const isCanvasTransitioning = useCanvasStore(state => state.isTransitioning)
  const showCanvasPane = isCanvasOpen || isCanvasTransitioning

  useEffect(() => {
    if (showCanvasPane && currentTab !== 'store') {
      void canvasLifecycle.showActiveBrowserView()
    } else {
      // Hide BrowserView when switching to store or canvas is closed
      void canvasLifecycle.hideAllBrowserViews()
    }

    return () => {
      void canvasLifecycle.hideAllBrowserViews()
    }
  }, [showCanvasPane, currentTab])

  // Render the right-side detail panel
  const emptyStateVariant = currentTab === 'my-apps' ? 'apps' as const : 'automation' as const
  const emptyStateAction = currentTab === 'my-apps'
    ? () => setCurrentTab('store')
    : () => setShowInstallDialog(true)

  const renderDetail = () => {
    if (!detailView) {
      return (
        <EmptyState
          hasApps={appsForCurrentTab.length > 0}
          onInstall={emptyStateAction}
          variant={emptyStateVariant}
        />
      )
    }

    switch (detailView.type) {
      case 'activity-thread':
        return <ActivityThread appId={detailView.appId} />
      case 'session-detail':
        return (
          <SessionDetailView
            appId={detailView.appId}
            runId={detailView.runId}
          />
        )
      case 'app-chat':
        return (
          <AppChatView
            appId={detailView.appId}
            spaceId={detailView.spaceId}
          />
        )
      case 'app-config':
        return <AppConfigPanel appId={detailView.appId} spaceName={selectedApp?.spaceId ? spaceMap[selectedApp.spaceId] : t('Global')} />
      case 'mcp-status':
        return <McpStatusCard appId={detailView.appId} />
      case 'skill-info':
        return <SkillInfoCard appId={detailView.appId} spaceName={selectedApp?.spaceId ? spaceMap[selectedApp.spaceId] : t('Global')} />
      case 'uninstalled-detail':
        return <UninstalledDetailView appId={detailView.appId} spaceName={selectedApp?.spaceId ? spaceMap[selectedApp.spaceId] : t('Global')} />
      default:
        return (
          <EmptyState
            hasApps={appsForCurrentTab.length > 0}
            onInstall={emptyStateAction}
            variant={emptyStateVariant}
          />
        )
    }
  }

  return (
    <div className="h-full flex flex-col bg-background app-shell" {...(isMobile ? bindSwipeBack() : {})}>
      {/* Header */}
      <Header
        left={
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 -ml-2 rounded-lg hover:bg-secondary/50"
            >
              {isMobile ? <ArrowLeft className="w-5 h-5" /> : <ChevronLeft className="w-4 h-4" />}
              {!isMobile && (currentSpace?.name ?? t('Back'))}
            </button>
            {!isMobile && <div className="h-5 w-px bg-border/70" />}
            <div className="flex items-center gap-2 min-w-0">
              <CafeLogo size={26} animated={false} />
              {!isMobile && (
                <div className="flex flex-col leading-none min-w-0">
                  <span className="text-sm font-semibold truncate">{t('Apps')}</span>
                  <span className="text-[11px] text-muted-foreground/80 truncate">{t('Digital humans, MCP, skills, and store')}</span>
                </div>
              )}
            </div>
          </div>
        }
        right={
          <button
            onClick={() => setView('settings')}
            className="p-2 hover:bg-secondary rounded-xl transition-colors surface-subtle"
            title={t('Settings')}
          >
            <Settings className="w-5 h-5" />
          </button>
        }
      />

      {/* Tab bar */}
      <div 
        className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/70 flex-shrink-0 bg-background/60 backdrop-blur relative overflow-x-auto"
        style={{
          paddingLeft: 'max(env(safe-area-inset-left), 1rem)',
          paddingRight: 'max(env(safe-area-inset-right), 1rem)',
        }}
      >
        <div className="flex items-center gap-1 flex-1">
          <button
            onClick={() => setCurrentTab('my-digital-humans')}
            className={`px-3 py-1.5 text-sm rounded-xl transition-colors whitespace-nowrap ${
              currentTab === 'my-digital-humans'
                ? 'toolbar-chip toolbar-chip-active text-foreground font-medium'
                : 'toolbar-chip text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('My Digital Humans')}
          </button>
          <button
            onClick={() => setCurrentTab('my-apps')}
            className={`px-3 py-1.5 text-sm rounded-xl transition-colors whitespace-nowrap ${
              currentTab === 'my-apps'
                ? 'toolbar-chip toolbar-chip-active text-foreground font-medium'
                : 'toolbar-chip text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('My Apps')}
          </button>
          <button
            onClick={() => setCurrentTab('store')}
            className={`px-3 py-1.5 text-sm rounded-xl transition-colors whitespace-nowrap ${
              currentTab === 'store'
                ? 'toolbar-chip toolbar-chip-active text-foreground font-medium'
                : 'toolbar-chip text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('App Store')}
          </button>
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
          <span className="pill-stat rounded-full px-3 py-1.5">{t('中文工具流')}</span>
          <span className="pill-stat rounded-full px-3 py-1.5">{t('MCP + Skills')}</span>
        </div>
      </div>

      {/* Content area */}
      {currentTab === 'store' ? (
        <StoreView />
      ) : (
        /* Split layout: left sidebar + right detail (shared by both tabs) */
        <div className="flex-1 flex overflow-hidden p-3 gap-3">
          {/* Left: App list - hidden on mobile when detail is shown */}
          {(!isMobile || !selectedAppId) && (
            <div className={`${isMobile ? 'flex-1' : 'w-64 flex-shrink-0'} panel-glass section-frame rounded-[1.5rem] overflow-hidden`}>
              {currentTab === 'my-apps' ? (
                <AppList
                  mode="apps"
                  onInstall={() => setCurrentTab('store')}
                  onManualAdd={() => setShowManualAddDialog(true)}
                  spaceMap={spaceMap}
                />
              ) : (
                <AppList
                  mode="automation"
                  onInstall={() => setShowInstallDialog(true)}
                  spaceMap={spaceMap}
                />
              )}
            </div>
          )}

          {/* Right: Detail panel - full screen on mobile */}
          {(!isMobile || selectedAppId) && (
            <div className={`flex-1 flex flex-col overflow-hidden panel-glass section-frame rounded-[1.5rem] ${isMobile && selectedAppId ? 'fixed inset-0 z-40 bg-background' : ''}`}>
              {/* Mobile back button for detail view */}
              {isMobile && selectedAppId && (
                <div 
                  className="flex items-center gap-2 px-4 py-3 border-b border-border/70 bg-background/80 backdrop-blur flex-shrink-0"
                  style={{
                    paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
                    paddingLeft: 'max(env(safe-area-inset-left), 1rem)',
                    paddingRight: 'max(env(safe-area-inset-right), 1rem)',
                  }}
                >
                  <button
                    onClick={clearSelection}
                    className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    <span>{t('Back')}</span>
                  </button>
                </div>
              )}
              {/* Session detail breadcrumb — replaces AutomationHeader when drilling into a specific run */}
              {isSessionDetail && selectedApp && (
              <SessionBreadcrumb
                appName={selectedAppName ?? ''}
                runId={(detailView as { runId: string }).runId}
                onBack={() => openActivityThread(selectedApp.id)}
              />
            )}

            {/* Automation persona card + tab bar — shown for all automation views except session detail drill-down */}
            {!isSessionDetail && !isUninstalledDetail && selectedAppId && selectedApp && selectedApp.spec.type === 'automation' && (
              <>
                <AutomationHeader appId={selectedAppId} spaceName={selectedApp?.spaceId ? spaceMap[selectedApp.spaceId] : t('Global')} />
                {showLoginNotice && resolvedSpec?.browser_login && detailView?.type === 'activity-thread' && (
                  <LoginNoticeBar
                    browserLogin={resolvedSpec.browser_login}
                    onDismiss={() => {
                      if (selectedAppId) {
                        void updateAppOverrides(selectedAppId, { loginNoticeDismissed: true })
                      }
                    }}
                    onOpenBrowser={(url, label) => {
                      void api.openLoginWindow(url, label)
                    }}
                  />
                )}
              </>
            )}

              {/* Detail content / canvas split */}
              <div className={`flex-1 min-h-0 ${showCanvasPane || isAppChat ? 'flex overflow-hidden' : 'overflow-y-auto'}`}>
                <div className={`${showCanvasPane ? 'w-[min(46%,560px)] min-w-[320px] flex-shrink-0 border-r border-border/70' : 'flex-1'} ${isAppChat ? 'min-h-0 flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
                  {renderDetail()}
                </div>
                {showCanvasPane && (
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <ContentCanvas />
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        )}

      {/* Install dialog */}
      {showInstallDialog && (
        <AppInstallDialog
          onClose={() => setShowInstallDialog(false)}
        />
      )}

      {/* Manual add dialog (MCP only — Skill delegates to SkillInstallDialog) */}
      {showManualAddDialog && (
        <ManualAddDialog
          onClose={() => setShowManualAddDialog(false)}
          onSkillAdd={() => setShowSkillInstallDialog(true)}
        />
      )}

      {/* Skill install dialog */}
      {showSkillInstallDialog && (
        <SkillInstallDialog
          onClose={() => setShowSkillInstallDialog(false)}
        />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// Breadcrumb sub-component
// ──────────────────────────────────────────────

interface SessionBreadcrumbProps {
  appName: string
  runId?: string
  label?: string
  onBack: () => void
}

function SessionBreadcrumb({ appName, runId, label, onBack }: SessionBreadcrumbProps) {
  const { t } = useTranslation()
  // Show abbreviated run ID (first 8 chars)
  const shortRunId = runId ? (runId.length > 8 ? runId.slice(0, 8) : runId) : ''
  const displayLabel = label || (shortRunId ? `${t('Run')} ${shortRunId}` : '')

  return (
    <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border/70 bg-muted/20 backdrop-blur flex-shrink-0">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        {appName}
      </button>
      {displayLabel && (
        <>
          <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
          <span className="text-sm text-muted-foreground">
            {displayLabel}
          </span>
        </>
      )}
    </div>
  )
}
