/**
 * Capacitor ForegroundService Plugin Bridge
 *
 * TypeScript interface for the native Android ForegroundServicePlugin.
 * Controls the foreground service that keeps WebSocket connections alive
 * when the app is in the background.
 *
 * Only available in Capacitor mode — no-ops in Electron/Remote.
 */

import { isCapacitor } from './transport'

interface ForegroundServicePlugin {
  start(options: { title: string; body: string }): Promise<void>
  stop(): Promise<void>
}

let _plugin: ForegroundServicePlugin | null = null
let _pluginAvailable: boolean | null = null
let _started = false

/**
 * Check if the plugin is available (call once at startup).
 */
async function checkPluginAvailable(): Promise<boolean> {
  if (!isCapacitor()) return false
  if (_pluginAvailable !== null) return _pluginAvailable

  try {
    const { registerPlugin } = await import('@capacitor/core')
    _plugin = registerPlugin<ForegroundServicePlugin>('ForegroundService')
    _pluginAvailable = true
    return true
  } catch (err) {
    console.warn('[ForegroundService] Plugin not available:', err)
    _pluginAvailable = false
    return false
  }
}

/**
 * Start the foreground service with a persistent notification.
 * Call this when WebSocket connects to a server.
 *
 * Returns true if successful, false otherwise (never throws).
 */
export async function startForegroundService(title: string, body: string): Promise<boolean> {
  if (_started) return true

  // Check availability first
  const available = await checkPluginAvailable()
  if (!available || !_plugin) {
    console.warn('[ForegroundService] Plugin not available, skipping foreground service')
    return false
  }

  try {
    // Wrap in Promise.race with timeout to catch unresponsive plugins
    const result = await Promise.race([
      _plugin.start({ title, body }),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Plugin call timeout')), 5000)
      )
    ])

    if (result === null) return false

    _started = true
    console.log('[ForegroundService] Started successfully')
    return true
  } catch (err) {
    // Check for "not implemented" error - this is expected on some platforms
    const errMsg = String(err)
    if (errMsg.includes('not implemented') || errMsg.includes('not available')) {
      console.warn('[ForegroundService] Plugin method not implemented, foreground service disabled')
      _pluginAvailable = false
    } else {
      console.warn('[ForegroundService] Failed to start:', err)
    }
    return false
  }
}

/**
 * Stop the foreground service.
 * Call this when WebSocket disconnects or user explicitly disconnects.
 *
 * Returns true if successful, false otherwise (never throws).
 */
export async function stopForegroundService(): Promise<boolean> {
  if (!_started) return true

  // If plugin was never available, just mark as stopped
  if (!_pluginAvailable || !_plugin) {
    _started = false
    return true
  }

  try {
    await Promise.race([
      _plugin.stop(),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Plugin call timeout')), 3000)
      )
    ])

    _started = false
    console.log('[ForegroundService] Stopped successfully')
    return true
  } catch (err) {
    console.warn('[ForegroundService] Failed to stop:', err)
    _started = false
    return false
  }
}

/**
 * Check if the foreground service is currently running.
 */
export function isForegroundServiceRunning(): boolean {
  return _started
}
