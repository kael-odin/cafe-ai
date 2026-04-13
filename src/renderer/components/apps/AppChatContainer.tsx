/**
 * AppChatContainer
 *
 * Orchestration container for the Chat tab of an automation App.
 * Manages the layout between the native Cafe chat (AppChatView) and
 * IM session conversations (ImChatView), with a collapsible right-side
 * session panel (ImSessionPanel).
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import { PanelRight } from 'lucide-react'
import { useAppsPageStore } from '../../stores/apps-page.store'
import { useChatStore } from '../../stores/chat.store'
import { useTranslation } from '../../i18n'
import { AppChatView } from './AppChatView'
import { ImChatView } from './ImChatView'
import { ImSessionPanel } from './ImSessionPanel'
import type { ImSessionRecord } from '../../../shared/types/im-channel'
import { buildImSessionKey } from '../../../shared/apps/im-keys'

interface AppChatContainerProps {
  appId: string
  spaceId: string
}

export function AppChatContainer({ appId, spaceId }: AppChatContainerProps) {
  const { t } = useTranslation()
  const { imPanelOpen, selectedImSession, toggleImPanel, selectImSession } = useAppsPageStore()

  useEffect(() => { selectImSession(null) }, [appId, selectImSession])

  const hasActiveImSession = useImActiveIndicator(appId)
  const [imChatClearKey, setImChatClearKey] = useState(0)

  const handleSessionCleared = useCallback((clearedSession: ImSessionRecord) => {
    if (selectedImSession && selectedImSession.channel === clearedSession.channel && selectedImSession.chatId === clearedSession.chatId) {
      setImChatClearKey(prev => prev + 1)
    }
  }, [selectedImSession])

  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0 flex flex-col">
        {!imPanelOpen && (
          <div className="flex items-center justify-end px-2 py-1 flex-shrink-0">
            <button onClick={toggleImPanel} className="relative p-1.5 rounded hover:bg-secondary transition-colors" title={t('Conversations')}>
              <PanelRight className="w-4 h-4 text-muted-foreground" />
              {hasActiveImSession && (<span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-primary animate-pulse" />)}
            </button>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          {selectedImSession ? (
            <ImChatView appId={appId} spaceId={spaceId} session={selectedImSession} clearKey={imChatClearKey} />
          ) : (
            <AppChatView appId={appId} spaceId={spaceId} />
          )}
        </div>
      </div>
      {imPanelOpen && (
        <div className="fixed inset-0 z-50 bg-background sm:relative sm:inset-auto sm:z-auto sm:w-64 sm:border-l sm:border-border">
          <ImSessionPanel appId={appId} spaceId={spaceId} onSessionCleared={handleSessionCleared} />
        </div>
      )}
    </div>
  )
}

function useImActiveIndicator(appId: string): boolean {
  const imSessions = useAppsPageStore(s => s.imSessions)
  const convIds = useMemo(() => imSessions.map(s => buildImSessionKey(appId, s.channel, s.chatType, s.chatId)), [imSessions, appId])
  const selector = useCallback(
    (state: { sessions: Map<string, { isGenerating?: boolean }> }) => {
      for (const id of convIds) { if (state.sessions.get(id)?.isGenerating) return true }
      return false
    },
    [convIds]
  )
  return useChatStore(selector)
}
