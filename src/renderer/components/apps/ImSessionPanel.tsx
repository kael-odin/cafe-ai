/**
 * ImSessionPanel
 *
 * Right-side panel showing all conversations for the current digital human.
 */

import { useEffect, useCallback } from 'react'
import { MessageSquare, X } from 'lucide-react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import { useAppsPageStore } from '../../stores/apps-page.store'
import { useChatStore } from '../../stores/chat.store'
import { useIsMobile } from '../../hooks/useIsMobile'
import { buildImSessionKey } from '../../../shared/apps/im-keys'
import { ImSessionItem } from './ImSessionItem'
import type { ImSessionRecord } from '../../../shared/types/im-channel'

interface ImSessionPanelProps {
  appId: string
  spaceId: string
  onSessionCleared?: (session: ImSessionRecord) => void
}

export function ImSessionPanel({ appId, spaceId, onSessionCleared }: ImSessionPanelProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const { selectedImSession, selectImSession, toggleImPanel, imSessions, fetchImSessions } = useAppsPageStore()
  const resetSession = useChatStore(s => s.resetSession)

  useEffect(() => {
    fetchImSessions(appId)
    const interval = setInterval(() => fetchImSessions(appId), 15000)
    return () => clearInterval(interval)
  }, [appId, fetchImSessions])

  useEffect(() => {
    const unsub = api.onImSessionUpdated?.((data: unknown) => {
      const update = data as { appId?: string }
      if (update.appId === appId) { fetchImSessions(appId) }
    })
    return () => { unsub?.() }
  }, [appId, fetchImSessions])

  const handleSelectCafeChat = () => {
    selectImSession(null)
    if (isMobile) toggleImPanel()
  }

  const handleSelectImSession = (session: typeof imSessions[number]) => {
    selectImSession(session)
    if (isMobile) toggleImPanel()
  }

  const handleClearConfirm = useCallback(async (session: ImSessionRecord) => {
    try {
      const res = await api.appImChatClear(appId, spaceId, session.channel, session.chatType, session.chatId)
      if (res.success) {
        const conversationId = buildImSessionKey(appId, session.channel, session.chatType, session.chatId)
        resetSession(conversationId)
        onSessionCleared?.(session)
      }
    } catch (err) { console.error('[ImSessionPanel] Clear session error:', err) }
  }, [appId, spaceId, resetSession, onSessionCleared])

  const isCafeChatSelected = selectedImSession === null

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border flex-shrink-0">
        <span className="text-sm font-medium">{t('Conversations')}</span>
        <button onClick={toggleImPanel} className="p-1 rounded hover:bg-secondary transition-colors">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <button onClick={handleSelectCafeChat} className={`w-full text-left px-3 py-2.5 transition-colors ${isCafeChatSelected ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'}`}>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{t('Cafe Chat')}</div>
              <div className="text-[11px] text-muted-foreground/60 mt-0.5">{t('Native conversation')}</div>
            </div>
          </div>
        </button>
        {imSessions.length > 0 && <div className="border-b border-border" />}
        {imSessions.map(session => (
          <ImSessionItem
            key={`${session.channel}:${session.chatId}`}
            session={session}
            isSelected={selectedImSession?.channel === session.channel && selectedImSession?.chatId === session.chatId}
            onClick={() => handleSelectImSession(session)}
            onClearConfirm={handleClearConfirm}
          />
        ))}
        {imSessions.length === 0 && (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-muted-foreground/50">{t('IM conversations will appear here')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
