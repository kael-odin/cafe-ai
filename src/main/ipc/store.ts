/**
 * Store IPC Handlers
 *
 * Exposes the Store (App Registry) operations to the renderer process.
 *
 * Channels:
 *   store:query                          Paginated query (new primary entry point)
 *   store:list-apps                      List apps from the store with optional filtering
 *   store:get-app-detail                 Get detailed info about a store app by slug
 *   store:install                        Install an app from the store into a space
 *   store:refresh                        Refresh the registry index from remote sources
 *   store:check-updates                  Check for available updates for installed apps
 *   store:get-registries                 Get the list of configured registry sources
 *   store:add-registry                   Add a new registry source
 *   store:remove-registry                Remove a registry source
 *   store:toggle-registry                Enable or disable a registry source
 *   store:update-registry-adapter-config Update adapter config (e.g. API keys) for a registry
 */

import { ipcMain } from 'electron'
import * as storeController from '../controllers/store.controller'
import { onSyncStatusChanged } from '../store'
import { sendToRenderer } from '../services/window.service'
import type { StoreInstallProgress, StoreQueryParams } from '../../shared/store/store-types'

export function registerStoreHandlers(): void {
  // ── store:query (new primary entry point) ─────────────────────────────
  ipcMain.handle(
    'store:query',
    async (_event, params: { search?: string; type?: string; category?: string; page?: number; pageSize?: number; locale?: string }) => {
      const queryParams: StoreQueryParams = {
        search: params.search,
        type: params.type as StoreQueryParams['type'],
        category: params.category,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 20,
        locale: params.locale,
      }
      return storeController.queryStoreApps(queryParams)
    }
  )

  // ── store:list-apps (legacy compat) ─────────────────────────────────
  ipcMain.handle(
    'store:list-apps',
    async (_event, query?: { search?: string; category?: string; type?: string; tags?: string[] }) => {
      return storeController.listStoreApps(query)
    }
  )

  // ── store:get-app-detail ───────────────────────────────────────────────
  ipcMain.handle(
    'store:get-app-detail',
    async (_event, slug: string) => {
      return storeController.getStoreAppDetail(slug)
    }
  )

  // ── store:install ──────────────────────────────────────────────────────
  ipcMain.handle(
    'store:install',
    async (event, input: { slug: string; spaceId: string | null; userConfig?: Record<string, unknown>; progressChannel?: string }) => {
      const { slug, spaceId, userConfig, progressChannel } = input

      // Build progress emitter if the renderer provided a channel name
      const onProgress = progressChannel
        ? (filesComplete: number, filesTotal: number, currentFile: string) => {
            const isAllDownloaded = filesTotal > 0 && filesComplete >= filesTotal
            const progress: StoreInstallProgress = {
              installId: progressChannel,
              phase: filesComplete === 0 && filesTotal === 0
                ? 'fetching-tree'
                : isAllDownloaded ? 'installing' : 'downloading',
              filesComplete,
              filesTotal,
              currentFile,
              // Reserve last 10% for the install step; downloading spans 0–90%
              percent: filesTotal === 0
                ? 5
                : isAllDownloaded
                  ? 90
                  : Math.round(10 + (filesComplete / filesTotal) * 80),
              message: filesComplete === 0 && filesTotal === 0
                ? 'Fetching file list...'
                : isAllDownloaded
                  ? 'Installing...'
                  : `Downloading files (${filesComplete}/${filesTotal})`,
            }
            // Guard against destroyed renderer (e.g. window closed mid-install)
            if (!event.sender.isDestroyed()) {
              event.sender.send(progressChannel, progress)
            }
          }
        : undefined

      return storeController.installStoreApp(slug, spaceId, userConfig, onProgress)
    }
  )

  // ── store:refresh ──────────────────────────────────────────────────────
  ipcMain.handle(
    'store:refresh',
    async () => {
      return storeController.refreshStoreIndex()
    }
  )

  // ── store:check-updates ────────────────────────────────────────────────
  ipcMain.handle(
    'store:check-updates',
    async () => {
      return storeController.checkStoreUpdates()
    }
  )

  // ── store:get-registries ───────────────────────────────────────────────
  ipcMain.handle(
    'store:get-registries',
    async () => {
      return storeController.getStoreRegistries()
    }
  )

  // ── store:add-registry ─────────────────────────────────────────────────
  ipcMain.handle(
    'store:add-registry',
    async (_event, input: { name: string; url: string; sourceType?: string; adapterConfig?: Record<string, unknown> }) => {
      return storeController.addStoreRegistry(input)
    }
  )

  // ── store:remove-registry ──────────────────────────────────────────────
  ipcMain.handle(
    'store:remove-registry',
    async (_event, registryId: string) => {
      return storeController.removeStoreRegistry(registryId)
    }
  )

  // ── store:toggle-registry ──────────────────────────────────────────────
  ipcMain.handle(
    'store:toggle-registry',
    async (_event, input: { registryId: string; enabled: boolean }) => {
      return storeController.toggleStoreRegistry(input.registryId, input.enabled)
    }
  )

  // ── store:update-registry-adapter-config ───────────────────────────────
  ipcMain.handle(
    'store:update-registry-adapter-config',
    async (_event, input: { registryId: string; adapterConfig: Record<string, unknown> }) => {
      return storeController.updateStoreRegistryAdapterConfig(input.registryId, input.adapterConfig)
    }
  )

  // ── Sync status push (main → renderer) ──────────────────────────────
  onSyncStatusChanged((event) => {
    sendToRenderer('store:sync-status-changed', event)
  })

  console.log('[StoreIPC] Store handlers registered (11 channels + sync push)')
}
