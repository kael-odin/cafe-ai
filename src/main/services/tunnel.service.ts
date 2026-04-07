/**
 * Tunnel Service - Cloudflare Tunnel integration for remote access
 * Directly spawns cloudflared binary to avoid ES Module readonly issues
 */

import { ChildProcess, spawn, exec } from 'child_process'
import { existsSync, statSync } from 'fs'
import { registerProcess, unregisterProcess, getCurrentInstanceId } from './health'
import { promisify } from 'util'

const execAsync = promisify(exec)

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
 * Windows system proxy settings
 */
interface WindowsProxySettings {
  enabled: boolean
  server: string
  override: string
}

/**
 * Get Windows system proxy settings
 */
async function getWindowsProxySettings(): Promise<WindowsProxySettings> {
  try {
    const { stdout } = await execAsync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /v ProxyServer /v ProxyOverride 2>nul',
      { timeout: 5000 }
    )
    
    let enabled = false
    let server = ''
    let override = ''
    
    const lines = stdout.split('\n')
    for (const line of lines) {
      if (line.includes('ProxyEnable')) {
        const match = line.match(/ProxyEnable\s+REG_DWORD\s+0x([0-9a-f]+)/i)
        if (match) {
          enabled = parseInt(match[1], 16) === 1
        }
      } else if (line.includes('ProxyServer')) {
        const match = line.match(/ProxyServer\s+REG_SZ\s+(.+)/i)
        if (match) {
          server = match[1].trim()
        }
      } else if (line.includes('ProxyOverride')) {
        const match = line.match(/ProxyOverride\s+REG_SZ\s+(.+)/i)
        if (match) {
          override = match[1].trim()
        }
      }
    }
    
    return { enabled, server, override }
  } catch {
    return { enabled: false, server: '', override: '' }
  }
}

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

  return new Promise((resolve, reject) => {
    // Wrap async operations to ensure reject is always called
    let rejected = false
    const safeReject = (err: Error) => {
      if (!rejected) {
        rejected = true
        state.status = 'error'
        state.error = err.message
        notifyStatus()
        reject(err)
      }
    }

    // Start async operations
    ;(async () => {
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
            safeReject(new Error(`Failed to install cloudflared binary: ${installErr}`))
            return
          }
        }

        // Check Windows system proxy settings with timeout
        let proxySettings: WindowsProxySettings = { enabled: false, server: '', override: '' }
        try {
          proxySettings = await Promise.race([
            getWindowsProxySettings(),
            new Promise<WindowsProxySettings>((_, timeoutReject) => 
              setTimeout(() => timeoutReject(new Error('Proxy detection timeout')), 3000)
            )
          ])
        } catch {
          console.log('[Tunnel] Could not detect proxy settings, assuming no proxy')
        }
        console.log('[Tunnel] System proxy settings:', proxySettings)

        // Spawn cloudflared directly with quick tunnel args
        // Use --protocol http2 to avoid QUIC/UDP being blocked by firewalls/proxies
        // Add --edge-ip-version 4 to force IPv4 (more reliable through proxies)
        const tunnelEnv: Record<string, string> = {}
        for (const [key, value] of Object.entries(process.env)) {
          if (value !== undefined) {
            tunnelEnv[key] = value
          }
        }

        // If system proxy is enabled, configure cloudflared to use it
        // This is crucial for Clash system proxy mode to work
        if (proxySettings.enabled && proxySettings.server) {
          console.log('[Tunnel] Using system proxy:', proxySettings.server)
          tunnelEnv.HTTP_PROXY = `http://${proxySettings.server}`
          tunnelEnv.HTTPS_PROXY = `http://${proxySettings.server}`
          tunnelEnv.http_proxy = `http://${proxySettings.server}`
          tunnelEnv.https_proxy = `http://${proxySettings.server}`
        } else {
          // No system proxy, clear proxy env vars for direct connection
          console.log('[Tunnel] No system proxy, using direct connection')
          const proxyVars = [
            'HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy',
            'ALL_PROXY', 'all_proxy', 'FTP_PROXY', 'ftp_proxy',
            'SOCKS_PROXY', 'socks_proxy', 'PROXY_URL', 'proxy_url'
          ]
          for (const varName of proxyVars) {
            delete tunnelEnv[varName]
          }
        }
        // Always set NO_PROXY for localhost
        tunnelEnv.NO_PROXY = 'localhost,127.0.0.1'
        tunnelEnv.no_proxy = 'localhost,127.0.0.1'

        const proc = spawn(binPath, [
          'tunnel',
          '--url', `http://localhost:${localPort}`,
          '--protocol', 'http2',
          '--edge-ip-version', '4',
          '--no-autoupdate',
          '--loglevel', 'info'
        ], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: tunnelEnv
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
          proc.kill()
          safeReject(new Error(errorMsg))
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
          // Must exclude 'api.trycloudflare.com' which appears in error messages
          // Valid tunnel URLs have format: <random-string>.trycloudflare.com
          const urlMatch = output.match(/https:\/\/(?!api\.)([a-zA-Z0-9-]+\.)+trycloudflare\.com/)
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
          clearTimeout(timeout)
          if (!urlFound) {
            // Provide more specific error message
            const exitMsg = lastError || `cloudflared exited with code ${code}`
            safeReject(new Error(exitMsg))
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
          safeReject(error)
        })

      } catch (error: unknown) {
        const err = error as Error
        console.error('[Tunnel] Failed to start:', err)
        safeReject(err)
      }
    })()
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
