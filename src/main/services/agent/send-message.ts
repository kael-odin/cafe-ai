/**
 * Agent Module - Send Message
 *
 * Sends a user message to the CC subprocess's REPL.
 *
 * Architecture (REPL consumer model):
 *   This module is responsible ONLY for sending. Consuming the response is handled
 *   by the persistent session consumer (session-consumer.ts), which runs for the
 *   lifetime of the V2 session.
 *
 *   Flow:
 *     1. Resolve API credentials and prepare SDK options
 *     2. Get or create V2 session (starts consumer if new session)
 *     3. Pre-process file attachments (cafe-ai specific)
 *     4. Add user message to conversation (assistant placeholder is NOT created here)
 *     5. v2Session.send(message) -> CC emits system:init -> consumer creates placeholder
 *     6. Return immediately (no await on stream processing)
 */

import { getConfig } from '../config.service'
import { addMessage } from '../conversation.service'
import {
  AI_BROWSER_SYSTEM_PROMPT,
  createAIBrowserMcpServer
} from '../ai-browser'
import { createWebSearchMcpServer } from '../web-search'
import { createCafeAppsMcpServer } from '../../apps/conversation-mcp'
import type {
  AgentRequest,
  SessionConfig,
} from './types'
import {
  getHeadlessElectronPath,
  getWorkingDir,
  getApiCredentials,
  getDbMcpServers,
} from './helpers'
import { emitAgentEvent } from './events'
import { buildSystemPromptWithAIBrowser } from './system-prompt'
import {
  getOrCreateV2Session,
  closeV2Session,
} from './session-manager'
import {
  formatCanvasContext,
  buildMessageContent,
} from './message-utils'
import { resolveCredentialsForSdk, buildBaseSdkOptions } from './sdk-config'
import { ensureFilePaths, prepareFileAttachments, parseBinaryFilesSync } from './file-attachments'

// ============================================
// Send Message
// ============================================

/**
 * Send a user message to the CC subprocess's REPL.
 *
 * Resolves credentials, ensures the V2 session exists (with a persistent
 * consumer), persists the user message, and calls v2Session.send().
 * Returns immediately - the session consumer handles the response.
 */
export async function sendMessage(
  request: AgentRequest
): Promise<void> {

  const {
    spaceId,
    conversationId,
    message,
    resumeSessionId,
    images,
    files,
    aiBrowserEnabled,
    thinkingEnabled,
    canvasContext
  } = request

  console.log(`[Agent] sendMessage: conv=${conversationId}${images && images.length > 0 ? `, images=${images.length}` : ''}${files && files.length > 0 ? `, files=${files.length}` : ''}${aiBrowserEnabled ? ', AI Browser enabled' : ''}${thinkingEnabled ? ', thinking=ON' : ''}${canvasContext?.isOpen ? `, canvas tabs=${canvasContext.tabCount}` : ''}`)

  const config = getConfig()
  const workDir = getWorkingDir(spaceId)

  // Accumulate stderr for detailed error messages
  let stderrBuffer = ''
  // Track whether V2 session was obtained (for defensive cleanup on error)
  let sessionObtained = false

  // Pre-parse files BEFORE saving the message so the UI shows parse status
  let processedFiles: typeof files = files
  if (files && files.length > 0) {
    try {
      processedFiles = await ensureFilePaths(files) ?? files
      processedFiles = await prepareFileAttachments(spaceId, conversationId, processedFiles) ?? processedFiles
      processedFiles = await parseBinaryFilesSync(spaceId, processedFiles) ?? processedFiles

      const parsedCount = processedFiles.filter(f => f.parseStatus === 'parsed').length
      const failedCount = processedFiles.filter(f => f.parseStatus === 'failed').length
      const fallbackCount = processedFiles.filter(f => f.parseStatus === 'fallback').length
      console.log(`[Agent][${conversationId}] File pre-parsing: ${parsedCount} parsed, ${failedCount} failed, ${fallbackCount} fallback (MinerU unavailable)`)
    } catch (err) {
      console.warn(`[Agent][${conversationId}] File pre-parsing failed, using raw files:`, err)
      processedFiles = files
    }
  }

  // Add user message to conversation (with images and processed files).
  // Assistant placeholder is NOT created here - it is created by the session
  // consumer when CC emits system:init (unified for user + autonomous turns).
  addMessage(spaceId, conversationId, {
    role: 'user',
    content: message,
    images: images,
    files: processedFiles
  })

  try {
    // Get API credentials and resolve for SDK use
    const credentials = await getApiCredentials(config)
    console.log(`[Agent] sendMessage using: ${credentials.provider}, model: ${credentials.model}, prompt: ${config.agent?.promptProfile ?? 'Cafe'}`)

    const resolvedCredentials = await resolveCredentialsForSdk(credentials)

    // Get conversation for session resumption
    const { getConversation } = await import('../conversation.service')
    const conversation = getConversation(spaceId, conversationId)
    const sessionId = resumeSessionId || conversation?.sessionId
    const electronPath = getHeadlessElectronPath()

    // Get MCP servers from installed apps database (global + space-scoped, with override)
    const dbMcpServers = getDbMcpServers(spaceId)

    // Build MCP servers config (DB apps + built-in MCPs)
    const mcpServers: Record<string, any> = dbMcpServers ? { ...dbMcpServers } : {}
    if (aiBrowserEnabled) {
      mcpServers['ai-browser'] = createAIBrowserMcpServer(undefined, workDir)
      console.log(`[Agent][${conversationId}] AI Browser MCP server added`)
    }

    // Always add Cafe-apps MCP for automation control
    mcpServers['Cafe-apps'] = createCafeAppsMcpServer(spaceId)
    console.log(`[Agent][${conversationId}] Cafe Apps MCP server added`)

    // Always add web-search MCP for web searching (replaces Claude's WebSearch)
    mcpServers['web-search'] = createWebSearchMcpServer()
    console.log(`[Agent][${conversationId}] Web Search MCP server added`)

    console.log(`[mcpServers]${Object.keys(mcpServers)}`)

    // Build base SDK options using shared configuration
    const sdkOptions = buildBaseSdkOptions({
      credentials: resolvedCredentials,
      workDir,
      electronPath,
      spaceId,
      conversationId,
      stderrHandler: (data: string) => {
        console.error(`[Agent][${conversationId}] CLI stderr:`, data)
        stderrBuffer += data
      },
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : null,
      maxTurns: config.agent?.maxTurns,
      promptProfile: config.agent?.promptProfile,
      configDirMode: config.agent?.configDirMode,
      customConfigDir: config.agent?.customConfigDir,
      enableTeams: config.agent?.enableTeams,
    })

    // Apply dynamic configurations (AI Browser, Thinking mode)
    if (aiBrowserEnabled) {
      sdkOptions.systemPrompt = buildSystemPromptWithAIBrowser(
        { workDir, modelInfo: resolvedCredentials.displayModel, promptProfile: config.agent?.promptProfile },
        AI_BROWSER_SYSTEM_PROMPT
      )
    }
    if (thinkingEnabled) {
      sdkOptions.maxThinkingTokens = 10240
    }

    const t0 = Date.now()
    console.log(`[Agent][${conversationId}] Getting or creating V2 session...`)

    // Session config for rebuild detection
    const sessionConfig: SessionConfig = {
      aiBrowserEnabled: !!aiBrowserEnabled
    }

    // Get or create persistent V2 session (also starts persistent consumer if new)
    const v2Session = await getOrCreateV2Session(
      spaceId, conversationId, sdkOptions, sessionId, sessionConfig, workDir,
      resolvedCredentials.displayModel  // Passed to consumer for thought parsing
    )

    sessionObtained = true

    // Dynamic runtime parameter adjustment
    try {
      if (v2Session.setModel) {
        await v2Session.setModel(resolvedCredentials.sdkModel)
        console.log(`[Agent][${conversationId}] Model set: ${resolvedCredentials.sdkModel}`)
      }
      if (v2Session.setMaxThinkingTokens) {
        await v2Session.setMaxThinkingTokens(thinkingEnabled ? 10240 : null)
        console.log(`[Agent][${conversationId}] Thinking mode: ${thinkingEnabled ? 'ON (10240 tokens)' : 'OFF'}`)
      }
    } catch (e) {
      console.error(`[Agent][${conversationId}] Failed to set dynamic params:`, e)
    }
    console.log(`[Agent][${conversationId}] V2 session ready: ${Date.now() - t0}ms`)

    // Prepare message content (canvas context prefix + multi-modal images + files)
    if (images && images.length > 0) {
      console.log(`[Agent][${conversationId}] Message includes ${images.length} image(s)`)
    }
    if (processedFiles && processedFiles.length > 0) {
      console.log(`[Agent][${conversationId}] Message includes ${processedFiles.length} file(s): ${processedFiles.map(f => f.name).join(', ')}`)
    }
    const canvasPrefix = formatCanvasContext(canvasContext)
    const messageWithContext = canvasPrefix + message
    const messageContent = buildMessageContent(messageWithContext, images, processedFiles)

    // Send to CC's REPL - consumer handles the response
    if (typeof messageContent === 'string') {
      v2Session.send(messageContent)
    } else {
      const userMessage = {
        type: 'user' as const,
        message: { role: 'user' as const, content: messageContent }
      }
      v2Session.send(userMessage as any)
    }

    console.log(`[Agent][${conversationId}] Message sent to REPL (${typeof messageContent === 'string' ? messageContent.length : 'multi-modal'} chars). Consumer handles response.`)

  } catch (error: unknown) {
    const err = error as Error

    // Don't report abort as error
    if (err.name === 'AbortError') {
      console.log(`[Agent][${conversationId}] Aborted by user`)
      return
    }

    console.error(`[Agent][${conversationId}] Error during send:`, error)

    // Extract detailed error message from stderr if available
    let errorMessage = err.message || 'Unknown error. Check logs in Settings > System > Logs.'

    // Windows: Check for Git Bash related errors
    if (process.platform === 'win32') {
      const isExitCode1 = errorMessage.includes('exited with code 1') ||
                          errorMessage.includes('process exited') ||
                          errorMessage.includes('spawn ENOENT')
      const isBashError = stderrBuffer?.includes('bash') ||
                          stderrBuffer?.includes('ENOENT') ||
                          errorMessage.includes('ENOENT')

      if (isExitCode1 || isBashError) {
        const { detectGitBash } = require('../git-bash.service')
        const gitBashStatus = detectGitBash()

        if (!gitBashStatus.found) {
          errorMessage = 'Command execution environment not installed. Please restart the app and complete setup, or install manually in settings.'
        } else {
          errorMessage = 'Command execution failed. This may be an environment configuration issue, please try restarting the app.\n\n' +
                        `Technical details: ${err.message}`
        }
      }
    }

    if (stderrBuffer && !errorMessage.includes('Command execution')) {
      const mcpErrorMatch = stderrBuffer.match(/Error: Invalid MCP configuration:[\s\S]*?(?=\n\s*at |$)/m)
      const genericErrorMatch = stderrBuffer.match(/Error: [\s\S]*?(?=\n\s*at |$)/m)
      if (mcpErrorMatch) {
        errorMessage = mcpErrorMatch[0].trim()
      } else if (genericErrorMatch) {
        errorMessage = genericErrorMatch[0].trim()
      }
    }

    emitAgentEvent('agent:error', spaceId, conversationId, {
      type: 'error',
      error: errorMessage
    })

    // No assistant placeholder exists (it's created by consumer on system:init,
    // which never fired because send failed). Create one now to hold the error.
    addMessage(spaceId, conversationId, {
      role: 'assistant',
      content: '',
      error: errorMessage,
      toolCalls: [],
    })

    // Emit complete so frontend transitions out of generating state
    emitAgentEvent('agent:complete', spaceId, conversationId, {
      type: 'complete',
      duration: 0,
    })

    // Defensive cleanup: close session + consumer if error occurred after session
    // was obtained (e.g., send() threw due to broken transport). Without this,
    // the consumer loop would spin on a potentially corrupted session.
    if (sessionObtained) {
      closeV2Session(conversationId)
    }

    // Emit health event for monitoring
    const { onAgentError, runPpidScanAndCleanup } = await import('../health')
    onAgentError(conversationId, errorMessage)
    runPpidScanAndCleanup().catch(e => {
      console.error('[Agent] PPID scan after error failed:', e)
    })
  }
}
