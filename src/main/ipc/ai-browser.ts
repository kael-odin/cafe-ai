/**
 * AI Browser IPC Handlers
 *
 * Handles IPC communication for the AI Browser functionality.
 * Provides endpoints for:
 * - Managing AI Browser state
 * - Getting system prompt
 *
 * LAZY INITIALIZATION:
 * This module uses lazy initialization to improve startup performance.
 * The heavy AI Browser module is only loaded when first used.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { onMainWindowChange } from '../services/window.service'
import {
  AI_BROWSER_SYSTEM_PROMPT,
  cleanupAIBrowser,
  initializeAIBrowser,
  isAIBrowserTool,
  setActiveBrowserView,
} from '../services/ai-browser'

let mainWindowRef: BrowserWindow | null = null
let initialized = false

/**
 * Ensure AI Browser is initialized only when first used.
 *
 * The service module is already part of the main bundle because other runtime
 * entry points import it statically. Keeping IPC initialization lazy still
 * avoids boot-time setup work without triggering Vite's mixed import warning.
 */
async function ensureInitialized(): Promise<void> {
  if (!initialized && mainWindowRef) {
    console.log('[AI Browser IPC] Initializing AI Browser...')
    initializeAIBrowser(mainWindowRef)
    initialized = true
  }
}

/**
 * Register all AI Browser IPC handlers
 *
 * NOTE: This function only registers IPC handlers.
 * The actual AI Browser module is loaded lazily on first use.
 */
export function registerAIBrowserHandlers(): void {
  // Subscribe to window changes
  onMainWindowChange((window) => {
    mainWindowRef = window
  })

  // NOTE: We do NOT call initializeAIBrowser() here!
  // It will be called lazily when the module is first used.

  // ============================================
  // Tool Information
  // ============================================

  /**
   * Get AI Browser system prompt addition
   */
  ipcMain.handle('ai-browser:get-system-prompt', async () => {
    try {
      await ensureInitialized()
      return { success: true, data: AI_BROWSER_SYSTEM_PROMPT }
    } catch (error) {
      console.error('[AI Browser IPC] Get system prompt failed:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * Check if a tool is an AI Browser tool
   */
  ipcMain.handle('ai-browser:is-browser-tool', async (_event, { toolName }: { toolName: string }) => {
    try {
      await ensureInitialized()
      return { success: true, data: isAIBrowserTool(toolName) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ============================================
  // State Management
  // ============================================

  /**
   * Set the active browser view for AI operations
   */
  ipcMain.handle('ai-browser:set-active-view', async (_event, { viewId }: { viewId: string }) => {
    try {
      await ensureInitialized()
      setActiveBrowserView(viewId)
      return { success: true }
    } catch (error) {
      console.error('[AI Browser IPC] Set active view failed:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  console.log('[AI Browser IPC] Handlers registered (lazy initialization enabled)')
}

/**
 * Cleanup AI Browser resources
 */
export function cleanupAIBrowserHandlers(): void {
  if (initialized) {
    cleanupAIBrowser()
    console.log('[AI Browser IPC] Module cleaned up')
  }

  // Reset state
  mainWindowRef = null
  initialized = false

  console.log('[AI Browser IPC] Handlers cleaned up')
}
