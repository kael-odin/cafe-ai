/**
 * apps/runtime -- Inbound Dispatch
 *
 * Unified entry point for all inbound IM messages. Channel adapters
 * (WeCom Bot, Feishu Bot, DingTalk Bot, etc.) call dispatchInboundMessage()
 * with a normalized InboundMessage + ReplyHandle. This module handles:
 *
 *   1. Routing 鈥?which digital human (App) should handle this message
 *   2. Session key construction 鈥?per-app, per-channel, per-chat isolation
 *   3. Execution 鈥?delegates to app-chat.ts for conversational AI
 *
 * Design principles:
 * - No IM protocol details 鈥?only works with InboundMessage + ReplyHandle
 * - No direct dependency on any specific adapter
 * - Resolves its own dependencies via module-level accessors (getAppManager, getConfig)
 */

import type { InboundMessage, ReplyHandle } from '../../../shared/types/inbound-message'
import type { InstalledApp } from '../manager'
import { getAppManager } from '../manager'
import { getConfig } from '../../services/config.service'
import { sendAppChatMessage, buildImSessionKey } from './app-chat'
import { getImSessionRegistry } from './im-session-registry'
import { stopGeneration } from '../../services/agent/control'
import { activeSessions } from '../../services/agent/session-manager'

// ============================================
// Constants
// ============================================

const LOG_TAG = '[Dispatch]'

/** Maximum reply length (platform-safe limit for most IM channels) */
const MAX_REPLY_LENGTH = 4000

/**
 * Commands that abort the current generation.
 * Slash-prefixed to avoid false triggers from normal conversation.
 */
const STOP_COMMANDS = new Set(['/cafe-stop', '/cafe-cancel'])

/** Check whether a message is a stop command (case-insensitive, trimmed). */
function isStopCommand(body: string): boolean {
  return STOP_COMMANDS.has(body.trim().toLowerCase())
}

// ============================================
// Routing
// ============================================

/**
 * Find the App that should handle an inbound IM message.
 *
 * Strategy (Phase 1):
 *   1. Scan active automation Apps for subscriptions matching msg.channel
 *   2. If multiple match, prefer one with a chatId filter matching msg.chatId
 *   3. Fallback to global defaultAppId from imChannels config
 *   4. Legacy fallback: wecomBot.defaultAppId (backward compat)
 *
 * @returns The matched App, or null if no route found
 */
function resolveTargetApp(msg: InboundMessage): InstalledApp | null {
  const manager = getAppManager()
  if (!manager) return null

  const activeApps = manager.listApps({ status: 'active', type: 'automation' })

  // Phase 1: scan subscriptions for matching channel source type
  // Map channel identifiers to subscription source types
  // e.g., 'wecom-bot' 鈫?'wecom' (the source.type used in App subscriptions)
  const channelToSourceType: Record<string, string> = {
    'wecom-bot': 'wecom',
    'feishu-bot': 'feishu',
    'dingtalk-bot': 'dingtalk',
  }
  const sourceType = channelToSourceType[msg.channel] ?? msg.channel

  let bestMatch: InstalledApp | null = null

  for (const app of activeApps) {
    if (app.spec.type !== 'automation') continue
    const subs = app.spec.subscriptions ?? []

    for (const sub of subs) {
      if (sub.source.type !== sourceType) continue

      // Check chatId filter (if specified in subscription config)
      const subChatId = sub.source.config?.chatId
      if (subChatId && subChatId === msg.chatId) {
        // Exact chatId match 鈥?highest priority
        return app
      }

      // Channel match without chatId filter 鈥?candidate for fallback
      if (!subChatId && !bestMatch) {
        bestMatch = app
      }
    }
  }

  if (bestMatch) return bestMatch

  // Fallback: global defaultAppId
  const config = getConfig()
  const defaultAppId =
    config.imChannels?.defaultAppId ??
    (config.wecomBot as any)?.defaultAppId // backward compat: old config may still have it here

  if (defaultAppId) {
    const app = manager.getApp(defaultAppId)
    if (app) return app
    console.warn(`${LOG_TAG} defaultAppId "${defaultAppId}" not found`)
  }

  return null
}

// ============================================
// Dispatch
// ============================================

/**
 * Dispatch an inbound IM message to the appropriate digital human.
 *
 * This is the single entry point called by all channel adapters.
 * It resolves the target App, constructs an isolated session key,
 * and delegates to app-chat for conversational AI execution.
 *
 * @param msg - Normalized inbound message from the channel adapter
 * @param reply - Reply handle for sending responses back to the IM channel
 */
export async function dispatchInboundMessage(
  msg: InboundMessage,
  reply: ReplyHandle
): Promise<void> {
  const app = resolveTargetApp(msg)

  if (!app) {
    console.log(
      `${LOG_TAG} No route for inbound message: ` +
      `channel=${msg.channel}, chatId=${msg.chatId}, chatType=${msg.chatType}`
    )
    return
  }

  if (!app.spaceId) {
    console.warn(`${LOG_TAG} App "${app.spec.name}" (${app.id}) has no spaceId 鈥?cannot dispatch`)
    return
  }

  // Build isolated session key
  const conversationId = buildImSessionKey(app.id, msg.channel, msg.chatType, msg.chatId)

  // Register session in ImSessionRegistry (idempotent 鈥?updates lastActiveAt on repeat)
  const registry = getImSessionRegistry()
  if (registry) {
    const displayName = msg.chatName ?? msg.fromName ?? msg.chatId
    registry.register(app.id, msg.channel, msg.chatId, msg.chatType, {
      displayName,
      lastSender: msg.fromName,
      lastMessage: msg.body.slice(0, 50),
    })
  }

  // ── Stop command: abort a stuck or running generation ──
  if (isStopCommand(msg.body)) {
    const isActive = activeSessions.has(conversationId)
    if (isActive) {
      console.log(`${LOG_TAG} Stop command received: channel=${msg.channel}, chatId=${msg.chatId}, session=${conversationId}`)
      try {
        await stopGeneration(conversationId)
        await reply.send('Generation stopped.')
      } catch (err) {
        console.error(`${LOG_TAG} Failed to stop generation: session=${conversationId}`, err)
        await reply.send('Failed to stop generation.').catch(() => {})
      }
    } else {
      await reply.send('No active generation to stop.').catch(() => {})
    }
    return
  }

  // For group chats, prefix sender name so the AI knows who is speaking
  const messageText = msg.chatType === 'group' && msg.fromName
    ? `[${msg.fromName}] ${msg.body}`
    : msg.body

  console.log(
    `${LOG_TAG} Routing: channel=${msg.channel}, chatId=${msg.chatId}, ` +
    `chatType=${msg.chatType} 鈫?app="${app.spec.name}" (${app.id}), ` +
    `session=${conversationId}, msgLen=${msg.body.length}`
  )

  try {
    await sendAppChatMessage({
      appId: app.id,
      spaceId: app.spaceId,
      message: messageText,
      conversationId,
      onReply: (finalContent: string) => {
        const replyText = finalContent.slice(0, MAX_REPLY_LENGTH)
        reply.send(replyText).catch((err) => {
          console.error(`${LOG_TAG} Failed to send reply: channel=${reply.channel}, chatId=${reply.chatId}`, err)
        })
      },
    })
  } catch (err) {
    console.error(
      `${LOG_TAG} Execution failed: app=${app.id}, channel=${msg.channel}, chatId=${msg.chatId}`,
      err
    )
    // Attempt to send error notification back to the IM channel
    try {
      const errorMsg = `鈿狅笍 Error: ${(err as Error).message?.slice(0, 200) ?? 'Unknown error'}`
      await reply.send(errorMsg)
    } catch {
      // Reply channel may be unavailable 鈥?nothing more we can do
    }
  }
}
