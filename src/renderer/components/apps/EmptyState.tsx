/**
 * EmptyState
 *
 * Shown in the right detail pane when no app is selected,
 * or when there are no installed apps.
 *
 * Supports two modes via `variant`:
 *   - 'automation' (default): messaging for digital humans
 *   - 'apps': messaging for MCP / Skill / Extension apps
 */

import { Blocks, Plus, Store } from 'lucide-react'
import { useTranslation } from '../../i18n'

interface EmptyStateProps {
  hasApps: boolean
  onInstall: () => void
  /** Which tab context this empty state is shown in. Defaults to 'automation'. */
  variant?: 'automation' | 'apps'
}

export function EmptyState({ hasApps, onInstall, variant = 'automation' }: EmptyStateProps) {
  const { t } = useTranslation()

  const isApps = variant === 'apps'
  const selectText = isApps
    ? t('Select an app to view details')
    : t('Select a digital human to view details')
  const selectHint = isApps
    ? t('Choose an app from the list on the left')
    : t('Choose a digital human from the list on the left')
  const emptyTitle = isApps
    ? t('No apps installed yet')
    : t('No digital humans yet')
  const emptyHint = isApps
    ? t('Browse the App Store to find and install apps')
    : t('Create your first digital human from a conversation')
  const actionLabel = isApps
    ? t('Browse App Store')
    : t('Create Digital Human')
  const ActionIcon = isApps ? Store : Plus

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center relative overflow-hidden">
      <span className="sakura-petal sakura-float-a right-16 top-12" />
      <span className="sakura-petal sakura-petal-sm sakura-float-b left-20 bottom-16" />

      <div className="w-16 h-16 rounded-[1.5rem] panel-glass flex items-center justify-center">
        <Blocks className="w-7 h-7 text-primary" />
      </div>

      {hasApps ? (
        <div>
          <p className="text-lg font-semibold text-foreground">{selectText}</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">{selectHint}</p>
          <p className="text-xs text-muted-foreground/80 mt-2">
            {isApps ? t('左侧列表支持按类型快速浏览') : t('左侧列表会根据当前状态自动分组')}
          </p>
        </div>
      ) : (
        <>
          <div>
            <p className="text-lg font-semibold text-foreground">{emptyTitle}</p>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">{emptyHint}</p>
            <p className="text-xs text-muted-foreground/80 mt-2">
              {isApps
                ? t('先从高频工具开始，中文工作流会更顺手')
                : t('先创建一个角色，再慢慢扩充你的数字员工团队')}
            </p>
          </div>
          <button
            onClick={onInstall}
            className="flex items-center gap-2 px-4 py-2.5 text-sm btn-primary text-primary-foreground rounded-xl"
          >
            <ActionIcon className="w-4 h-4" />
            {actionLabel}
          </button>
        </>
      )}
    </div>
  )
}
