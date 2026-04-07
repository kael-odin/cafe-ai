/**
 * Tunnel Service - Cloudflare Tunnel integration for remote access
 * Directly spawns cloudflared binary to avoid ES Module readonly issues
 */

import { ChildProcess, spawn } from 'child_process'
import { existsSync, statSync } from 'fs'
import { registerProcess, unregisterProcess, getCurrentInstanceId } from './health'

// Tunnel state
interface TunnelState {
  process: ChildProcess | null
  url: string | null
  status: 'stopped' | 'starting' | 'running' | 'error'
  error: string | null
}

const state: TunnelState = {
  process: null,
  url: null,
  status: 'stopped',
  error: null
}

// Callback for status updates
type StatusCallback = (status: TunnelState) => void
let statusCallback: StatusCallback | null = null

// Minimum valid binary size (Windows ~60MB, others ~30MB)
const MIN_BINARY_SIZE = 30 * 1024 * 1024 // 30 MB

/**
 * Get the correct binary path (handles asar unpacking)
 */
async function getBinaryPath(): Promise<string> {
  const cloudflared = await import('cloudflared')
  let binPath = cloudflared.bin

  // Fix path for packaged Electron app (asarUnpack)
  if (binPath.includes('app.asar')) {
    binPath = binPath.replace('app.asar', 'app.asar.unpacked')
  }

  return binPath
}

/**
 * Validate binary file exists and has reasonable size
 */
function validateBinary(binPath: string): { valid: boolean; reason?: string } {
  if (!existsSync(binPath)) {
    return { valid: false, reason: 'Binary file not found' }
  }

  try {
    const stats = statSync(binPath)
    if (stats.size < MIN_BINARY_SIZE) {
      return { valid: false, reason: `Binary file too small (${Math.round(stats.size / 1024 / 1024)}MB), expected at least 30MB` }
    }
    return { valid: true }
  } catch (err) {
    return { valid: false, reason: `Cannot stat binary: ${err}` }
  }
}

/**
 * Start Cloudflare Tunnel (Quick Tunnel - no account needed)
 */
export async function startTunnel(localPort: number): Promise<string> {
  if (state.status === 'running') {
    return state.url!
  }

  if (state.status === 'starting') {
    throw new Error('Tunnel is already starting')
  }

  state.status = 'starting'
  state.error = null
  notifyStatus()

  return new Promise(async (resolve, reject) => {
    try {
      const cloudflared = await import('cloudflared')
      const binPath = await getBinaryPath()

      console.log('[Tunnel] Starting cloudflared...')
      console.log('[Tunnel] Binary at:', binPath)

      // Validate binary exists and is valid
      const validation = validateBinary(binPath)
      if (!validation.valid) {
        console.log('[Tunnel] Binary invalid:', validation.reason)
        console.log('[Tunnel] Attempting to reinstall binary...')
        try {
          await cloudflared.install(binPath)
          // Re-validate after install
          const reValidation = validateBinary(binPath)
          if (!reValidation.valid) {
            throw new Error(`Binary still invalid after reinstall: ${reValidation.reason}`)
          }
          console.log('[Tunnel] Binary reinstalled successfully')
        } catch (installErr) {
          const errMsg = `Failed to install cloudflared binary: ${installErr}`
          console.error('[Tunnel]', errMsg)
          state.status = 'error'
          state.error = errMsg
          notifyStatus()
          reject(new Error(errMsg))
          return
        }
      }

      // Spawn cloudflared directly with quick tunnel args
      // Use --protocol http2 to avoid QUIC/UDP being blocked by firewalls/proxies
      // Add --edge-ip-version 4 to force IPv4 (more reliable through proxies)
      // Create clean environment without any proxy settings
      const cleanEnv: Record<string, string> = {}
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          cleanEnv[key] = value
        }
      }
      // Remove all proxy-related environment variables
      const proxyVars = [
        'HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy',
        'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy',
        'FTP_PROXY', 'ftp_proxy', 'SOCKS_PROXY', 'socks_proxy',
        'PROXY_URL', 'proxy_url', 'ELECTRON_RUN_AS_NODE'
      ]
      for (const varName of proxyVars) {
        delete cleanEnv[varName]
      }
      // Set NO_PROXY to bypass all proxies
      cleanEnv.NO_PROXY = '*'
      cleanEnv.no_proxy = '*'

      const proc = spawn(binPath, [
        'tunnel',
        '--url', `http://localhost:${localPort}`,
        '--protocol', 'http2',
        '--edge-ip-version', '4',
        '--no-autoupdate',
        '--loglevel', 'info'
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: cleanEnv
      })

      state.process = proc

      // Register with health system for orphan detection
      const instanceId = getCurrentInstanceId()
      if (instanceId && proc.pid) {
        registerProcess({
          id: 'tunnel',
          pid: proc.pid,
          type: 'tunnel',
          instanceId,
          startedAt: Date.now()
        })
      }

      // Set a timeout for URL to be received (increased to 60s for slow networks)
      const timeout = setTimeout(() => {
        console.error('[Tunnel] Timeout waiting for URL')
        let errorMsg = 'Timeout waiting for tunnel URL. '
        errorMsg += 'Possible causes: 1) Network blocked by firewall/proxy; '
        errorMsg += '2) Cloudflare servers unreachable; '
        errorMsg += '3) DNS resolution failed. '
        errorMsg += 'Try: Disable VPN/Clash TUN mode, or check network connectivity.'
        state.status = 'error'
        state.error = errorMsg
        notifyStatus()
        proc.kill()
        reject(new Error(errorMsg))
      }, 60000)

      let urlFound = false
      let lastError = ''

      // Parse stderr for the tunnel URL and errors
      proc.stderr?.on('data', (data: Buffer) => {
        const output = data.toString()
        console.log('[Tunnel] stderr:', output)

        // Capture error messages
        if (output.toLowerCase().includes('error') || output.toLowerCase().includes('failed')) {
          lastError = output
        }

        // Look for the trycloudflare.com URL
        const urlMatch = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/)
        if (urlMatch && !urlFound) {
          urlFound = true
          clearTimeout(timeout)
          const url = urlMatch[0]
          console.log('[Tunnel] Got URL:', url)
          state.url = url
          state.status = 'running'
          notifyStatus()
          resolve(url)
        }
      })

      proc.stdout?.on('data', (data: Buffer) => {
        console.log('[Tunnel] stdout:', data.toString())
      })

      // Handle process exit
      proc.on('exit', (code) => {
        console.log('[Tunnel] Process exited with code:', code)
        if (!urlFound) {
          clearTimeout(timeout)
          // Provide more specific error message
          if (code !== 0 && code !== null) {
            const exitMsg = lastError || `cloudflared exited with code ${code}`
            state.error = exitMsg
          }
        }
        // Unregister from health system
        unregisterProcess('tunnel', 'tunnel')
        state.process = null
        state.url = null
        state.status = 'stopped'
        notifyStatus()
      })

      // Handle errors
      proc.on('error', (error: Error) => {
        console.error('[Tunnel] Process error:', error)
        clearTimeout(timeout)
        // Unregister from health system
        unregisterProcess('tunnel', 'tunnel')
        state.error = error.message
        state.status = 'error'
        state.process = null
        notifyStatus()
        if (!urlFound) {
          reject(error)
        }
      })

    } catch (error: unknown) {
      const err = error as Error
      console.error('[Tunnel] Failed to start:', err)
      state.status = 'error'
      state.error = err.message
      notifyStatus()
      reject(err)
    }
  })
}

/**
 * Stop Cloudflare Tunnel
 */
export async function stopTunnel(): Promise<void> {
  if (state.process) {
    console.log('[Tunnel] Stopping tunnel...')

    // Unregister from health system first
    unregisterProcess('tunnel', 'tunnel')

    try {
      state.process.kill('SIGTERM')
    } catch (error) {
      console.error('[Tunnel] Error stopping tunnel:', error)
      // Force kill if SIGTERM fails
      try {
        state.process.kill('SIGKILL')
      } catch {
        // Ignore
      }
    }

    state.process = null
    state.url = null
    state.status = 'stopped'
    state.error = null
    notifyStatus()

    console.log('[Tunnel] Tunnel stopped')
  }
}

/**
 * Get tunnel status
 */
export function getTunnelStatus(): TunnelState {
  return { ...state }
}

/**
 * Set status callback
 */
export function onTunnelStatusChange(callback: StatusCallback): void {
  statusCallback = callback
}

/**
 * Notify status change
 */
function notifyStatus(): void {
  if (statusCallback) {
    statusCallback({ ...state })
  }
}

/**
 * Check if cloudflared is available
 */
export async function checkCloudflaredAvailable(): Promise<boolean> {
  try {
    await import('cloudflared')
    return true
  } catch {
    return false
  }
}
