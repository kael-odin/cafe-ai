/**
 * AppList
 *
 * Left sidebar of AppsPage. Groups installed apps by runtime status
 * and renders AppListItem rows. Shows install/store actions at the bottom.
 *
 * Supports two modes via `mode` prop:
 *   - 'automation' (default): shows only automation apps, grouped by runtime status
 *   - 'apps': shows only non-automation apps (mcp / skill / extension), grouped by type
 */

import { useMemo } from 'react'
import { Plus, Upload } from 'lucide-react'
import type { InstalledApp } from '../../../shared/apps/app-types'
import type { AppType } from '../../../shared/apps/spec-types'
import { useAppsStore } from '../../stores/apps.store'
import { useAppsPageStore } from '../../stores/apps-page.store'
import { AppListItem } from './AppListItem'
import { useTranslation } from '../../i18n'

/** Which category of apps to display */
export type AppListMode = 'automation' | 'apps'

const NON_AUTOMATION_TYPES: ReadonlySet<AppType> = new Set<AppType>(['mcp', 'skill', 'extension'])

interface AppListProps {
  onInstall: () => void
  /** Callback for manual MCP/Skill add (only shown in 'apps' mode) */
  onManualAdd?: () => void
  /** Map from spaceId -> space name, for showing space labels on each app */
  spaceMap?: Record<string, string>
  /** Which app category to show. Defaults to 'automation'. */
  mode?: AppListMode
}

// ──────────────────────────────────────────────
// Grouping helpers
// ──────────────────────────────────────────────

type AppGroup = {
  label: string
  apps: InstalledApp[]
}

/** Group automation apps by runtime status */
function groupAutomationApps(apps: InstalledApp[]): AppGroup[] {
  const running: InstalledApp[] = []
  const waitingUser: InstalledApp[] = []
  const paused: InstalledApp[] = []
  const uninstalled: InstalledApp[] = []

  for (const app of apps) {
    if (app.status === 'uninstalled') {
      uninstalled.push(app)
    } else if (app.status === 'waiting_user') {
      waitingUser.push(app)
    } else if (app.status === 'paused') {
      paused.push(app)
    } else {
      running.push(app)
    }
  }

  const groups: AppGroup[] = []
  if (running.length > 0) groups.push({ label: 'Active', apps: running })
  if (waitingUser.length > 0) groups.push({ label: 'Waiting for you', apps: waitingUser })
  if (paused.length > 0) groups.push({ label: 'Paused', apps: paused })
  if (uninstalled.length > 0) groups.push({ label: 'Uninstalled', apps: uninstalled })
  return groups
}

/** Group non-automation apps by type (MCP / Skill / Extension) */
function groupNonAutomationApps(apps: InstalledApp[]): AppGroup[] {
  const mcp: InstalledApp[] = []
  const skill: InstalledApp[] = []
  const extension: InstalledApp[] = []
  const uninstalled: InstalledApp[] = []

  for (const app of apps) {
    if (app.status === 'uninstalled') {
      uninstalled.push(app)
      continue
    }
    switch (app.spec.type) {
      case 'mcp': mcp.push(app); break
      case 'skill': skill.push(app); break
      case 'extension': extension.push(app); break
    }
  }

  const groups: AppGroup[] = []
  if (skill.length > 0) groups.push({ label: 'Skill', apps: skill })
  if (mcp.length > 0) groups.push({ label: 'MCP', apps: mcp })
  if (extension.length > 0) groups.push({ label: 'Extension', apps: extension })
  if (uninstalled.length > 0) groups.push({ label: 'Uninstalled', apps: uninstalled })
  return groups
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export function AppList({ onInstall, onManualAdd, spaceMap, mode = 'automation' }: AppListProps) {
  const { t } = useTranslation()
  const { apps } = useAppsStore()
  const { selectedAppId, selectApp } = useAppsPageStore()

  const filteredApps = useMemo(() => {
    return apps.filter(app => {
      if (app.status === 'uninstalled') {
        // Show uninstalled apps in the tab matching their original type
        const isNonAutomation = NON_AUTOMATION_TYPES.has(app.spec.type as AppType)
        return mode === 'apps' ? isNonAutomation : !isNonAutomation
      }
      const isNonAutomation = NON_AUTOMATION_TYPES.has(app.spec.type as AppType)
      return mode === 'apps' ? isNonAutomation : !isNonAutomation
    })
  }, [apps, mode])

  const groups = useMemo(() => {
    return mode === 'apps'
      ? groupNonAutomationApps(filteredApps)
      : groupAutomationApps(filteredApps)
  }, [filteredApps, mode])

  const isAppsMode = mode === 'apps'
  const emptyText = isAppsMode ? t('No apps installed yet') : t('No digital humans yet')
  const actionText = isAppsMode ? t('Browse App Store') : t('Create Digital Human')

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable list */}
      <div className="px-3 pt-3 pb-2 border-b border-border/70 bg-background/20 backdrop-blur-sm">
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">
          {isAppsMode ? t('Toolkit') : t('Workspace')}
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {isAppsMode ? t('Installed Apps') : t('Digital Humans')}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAppsMode
                ? t('适合中文用户的技能、MCP 与扩展入口 / Skills, MCPs and extensions')
                : t('把常用自动化角色集中到一个工作台 / Your automation workspace')}
            </p>
          </div>
          <div className="text-xs text-muted-foreground rounded-full bg-secondary/70 px-2.5 py-1">
            {filteredApps.length}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-3 space-y-5">
        {groups.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/70 bg-background/15 px-4 py-8 text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-secondary/80 flex items-center justify-center">
              {isAppsMode ? <Upload className="w-5 h-5 text-primary" /> : <Plus className="w-5 h-5 text-primary" />}
            </div>
            <p className="text-sm font-medium text-foreground">{emptyText}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {isAppsMode
                ? t('可以先去应用商店看看，也可以手动添加 SKILL / MCP')
                : t('从一次对话开始创建数字员工，或先去应用商店浏览模板')}
            </p>
          </div>
        )}

        {groups.map(group => (
          <div key={group.label}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2">
              {t(group.label)}
              <span className="ml-1 font-normal normal-case tracking-normal">({group.apps.length})</span>
            </p>
            <div className="space-y-0.5">
              {group.apps.map(app => (
                <AppListItem
                  key={app.id}
                  app={app}
                  isSelected={selectedAppId === app.id}
                  spaceName={app.spaceId ? spaceMap?.[app.spaceId] : t('Global')}
                  onClick={() => {
                    if (app.status === 'uninstalled') {
                      selectApp(app.id, 'uninstalled')
                    } else {
                      selectApp(app.id, app.spec.type)
                    }
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom actions */}
      <div className="flex-shrink-0 border-t border-border/70 p-3 space-y-2 bg-background/20">
        {!isAppsMode && (
          <button
            onClick={onInstall}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            {actionText}
          </button>
        )}
        {isAppsMode && onManualAdd && (
          <button
            onClick={onManualAdd}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-xl transition-colors"
          >
            <Upload className="w-4 h-4" />
            {t('Manual Add SKILL/MCP')}
          </button>
        )}

        <button
          onClick={onInstall}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm btn-primary text-primary-foreground rounded-xl"
        >
          <Plus className="w-4 h-4" />
          {isAppsMode ? t('Browse App Store') : actionText}
        </button>
      </div>
    </div>
  )
}
