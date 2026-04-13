/**
 * ImSessionItem
 *
 * Renders a single IM session entry in the session panel list.
 */

import { useState, useCallback } from 'react'
import { Eraser, User, Users } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useChatStore } from '../../stores/chat.store'
import type { ImSessionRecord } from '../../../shared/types/im-channel'
import { buildImSessionKey } from '../../../shared/apps/im-keys'
import { CHANNEL_LABELS } from './im-channel-labels'

interface ImSessionItemProps {
  session: ImSessionRecord
  isSelected: boolean
  onClick: () => void
  onClearConfirm?: (session: ImSessionRecord) => void
}

function formatRelativeTime(epochMs: number, t: (key: string, options?: Record<string, unknown>) => string): string {
  const diff = Date.now() - epochMs
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return t('now')
  if (minutes < 60) return t('{{count}}m', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('{{count}}h', { count: hours })
  const days = Math.floor(hours / 24)
  return t('{{count}}d', { count: days })
}

export function ImSessionItem({ session, isSelected, onClick, onClearConfirm }: ImSessionItemProps) {
  const { t } = useTranslation()
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const conversationId = buildImSessionKey(session.appId, session.channel, session.chatType, session.chatId)
  const isGenerating = useChatStore(s => s.getSession(conversationId).isGenerating)

  const displayName = session.customName || session.displayName || session.chatId
  const channelLabel = CHANNEL_LABELS[session.channel] ?? session.channel
  const chatTypeLabel = session.chatType === 'group' ? t('Group') : t('Direct')
  const ChatTypeIcon = session.chatType === 'group' ? Users : User

  const handleClearClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowClearConfirm(true)
  }, [])

  const handleConfirm = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onClearConfirm?.(session)
    setShowClearConfirm(false)
  }, [session, onClearConfirm])

  const handleCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowClearConfirm(false)
  }, [])

  return (
    <button
      onClick={onClick}
      className={`group w-full text-left px-3 py-2.5 transition-colors ${
        isSelected
          ? 'bg-secondary text-foreground'
          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isGenerating && (
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{displayName}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <ChatTypeIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <span className="text-[11px] text-muted-foreground truncate">
              {channelLabel} · {chatTypeLabel}
            </span>
          </div>
          {session.lastMessage && (
            <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
              {session.lastSender ? `${session.lastSender}: ` : ''}{session.lastMessage}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0 self-start mt-0.5">
          {showClearConfirm ? (
            <div className="flex items-center gap-1.5">
              <button onClick={handleConfirm} className="px-1.5 py-0.5 text-[11px] text-destructive hover:bg-destructive/10 rounded transition-colors">{t('Confirm')}</button>
              <button onClick={handleCancel} className="px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-secondary rounded transition-colors">{t('Cancel')}</button>
            </div>
          ) : (
            <>
              <span className="text-[10px] text-muted-foreground/50">{formatRelativeTime(session.lastActiveAt, t)}</span>
              {onClearConfirm && !isGenerating && (
                <button onClick={handleClearClick} className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-secondary transition-all" title={t('Clear session')}>
                  <Eraser className="w-3 h-3 text-muted-foreground/60 hover:text-destructive" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </button>
  )
}
