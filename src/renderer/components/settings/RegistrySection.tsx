/**
 * Registry Section Component
 * Manages App Store registry sources (view, add, remove, toggle, adapter config)
 */

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Loader2, Key } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { api } from '../../api'
import { CafeLogo } from '../brand/CafeLogo'
import type { RegistrySource } from '../../../shared/store/store-types'

const SOURCE_TYPE_LABELS: Record<string, string> = {
  'cafe': 'Cafe',
  'Cafe': 'Cafe',
  'mcp-registry': 'MCP',
  'smithery': 'Smithery',
  'claude-skills': 'Claude Skills',
}

export function RegistrySection(): JSX.Element {
  const { t } = useTranslation()

  // State
  const [registries, setRegistries] = useState<RegistrySource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  // Smithery API key editing state: registryId -> value
  const [apiKeyEditing, setApiKeyEditing] = useState<Record<string, string>>({})
  const [apiKeySaving, setApiKeySaving] = useState<Record<string, boolean>>({})

  // Load registries on mount
  const loadRegistries = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await api.storeGetRegistries()
      if (result.success && result.data) {
        setRegistries(result.data as RegistrySource[])
      } else {
        setError(result.error ?? t('Failed to load registries'))
      }
    } catch {
      setError(t('Failed to load registries'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadRegistries()
  }, [loadRegistries])

  // Add registry
  const handleAdd = async () => {
    setAddError(null)

    const trimmedName = newName.trim()
    const trimmedUrl = newUrl.trim()

    if (!trimmedName) {
      setAddError(t('Name is required'))
      return
    }
    if (!trimmedUrl) {
      setAddError(t('URL is required'))
      return
    }

    try {
      new URL(trimmedUrl)
    } catch {
      setAddError(t('Please enter a valid URL'))
      return
    }

    try {
      setAdding(true)
      const result = await api.storeAddRegistry({ name: trimmedName, url: trimmedUrl })
      if (result.success) {
        setNewName('')
        setNewUrl('')
        setShowAddForm(false)
        await loadRegistries()
      } else {
        setAddError(result.error ?? t('Failed to add registry'))
      }
    } catch {
      setAddError(t('Failed to add registry'))
    } finally {
      setAdding(false)
    }
  }

  // Remove registry
  const handleRemove = async (registryId: string) => {
    try {
      setError(null)
      const result = await api.storeRemoveRegistry(registryId)
      if (result.success) {
        await loadRegistries()
      } else {
        setError(result.error ?? t('Failed to remove registry'))
      }
    } catch {
      setError(t('Failed to remove registry'))
    }
  }

  // Toggle registry enabled/disabled
  const handleToggle = async (registryId: string, enabled: boolean) => {
    try {
      setError(null)
      const result = await api.storeToggleRegistry(registryId, enabled)
      if (result.success) {
        setRegistries((prev) =>
          prev.map((r) => (r.id === registryId ? { ...r, enabled } : r))
        )
      } else {
        setError(result.error ?? t('Failed to update registry'))
      }
    } catch {
      setError(t('Failed to update registry'))
    }
  }

  // Save Smithery API key
  const handleSaveApiKey = async (registryId: string) => {
    const apiKey = apiKeyEditing[registryId] ?? ''
    setApiKeySaving(prev => ({ ...prev, [registryId]: true }))
    try {
      const result = await api.storeUpdateRegistryAdapterConfig(registryId, { apiKey })
      if (!result.success) {
        setError(result.error ?? t('Failed to save API key'))
      } else {
        // Clear editing state on success
        setApiKeyEditing(prev => {
          const next = { ...prev }
          delete next[registryId]
          return next
        })
      }
    } catch {
      setError(t('Failed to save API key'))
    } finally {
      setApiKeySaving(prev => ({ ...prev, [registryId]: false }))
    }
  }

  const BUILTIN_IDS = new Set(['official', 'mcp-official', 'smithery', 'claude-skills'])
  const isBuiltin = (registry: RegistrySource) =>
    (registry.isDefault ?? false) || BUILTIN_IDS.has(registry.id)

  return (
    <section id="app-store" className="panel-glass section-frame rounded-[1.5rem] p-6 relative overflow-hidden">
      <span className="sakura-petal sakura-petal-sm sakura-float-a right-8 top-6" />
      <div className="flex items-center gap-3 mb-4">
        <CafeLogo size={28} animated={false} />
        <div>
          <h2 className="text-lg font-medium">{t('App Store')}</h2>
          <p className="text-sm text-muted-foreground mt-1">
          {t('Manage registry sources for discovering and installing apps')}
          </p>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 px-3 py-2 text-sm text-red-500 bg-red-500/10 rounded-lg">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('Loading...')}
        </div>
      ) : (
        <>
          {/* Registry list */}
          <div className="space-y-3">
            {registries.map((registry) => {
              const hasApiKeyDraft = Object.prototype.hasOwnProperty.call(apiKeyEditing, registry.id)

              return (
              <div key={registry.id} className="subsection-soft-panel px-4 py-3 rounded-[1rem]">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{registry.name}</span>
                      {registry.sourceType && (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                          {SOURCE_TYPE_LABELS[registry.sourceType] ?? registry.sourceType}
                        </span>
                      )}
                      {registry.isDefault && !registry.sourceType && (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-xs rounded-full bg-secondary text-secondary-foreground">
                          {t('Default')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {registry.url}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    {/* Toggle switch */}
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={registry.enabled}
                        onChange={() => { void handleToggle(registry.id, !registry.enabled) }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-secondary rounded-full peer peer-checked:bg-primary transition-colors">
                        <div
                          className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                            registry.enabled ? 'translate-x-5' : 'translate-x-0.5'
                          } mt-0.5`}
                        />
                      </div>
                    </label>

                    {/* Delete button — hidden for builtins */}
                    {!isBuiltin(registry) && (
                      <button
                        type="button"
                        onClick={() => { void handleRemove(registry.id) }}
                        className="p-1.5 text-muted-foreground hover:text-destructive rounded-xl surface-subtle transition-colors"
                        title={t('Remove registry')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Smithery API key row */}
                {registry.sourceType === 'smithery' && (
                  <div className="mt-3 flex items-center gap-2 subsection-soft-panel p-3 rounded-xl">
                    <Key className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <input
                      type="password"
                      value={hasApiKeyDraft ? apiKeyEditing[registry.id] : ((registry.adapterConfig?.apiKey as string | undefined) ?? '')}
                      onChange={e =>
                        setApiKeyEditing(prev => ({ ...prev, [registry.id]: e.target.value }))
                      }
                      placeholder={t('Smithery API key (optional)')}
                      className="form-input-soft flex-1 px-2.5 py-1.5 text-xs"
                    />
                    {hasApiKeyDraft && (
                      <button
                        type="button"
                        onClick={() => { void handleSaveApiKey(registry.id) }}
                        disabled={apiKeySaving[registry.id] ?? false}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs btn-primary text-primary-foreground rounded-xl transition-colors disabled:opacity-50"
                      >
                        {(apiKeySaving[registry.id] ?? false) && <Loader2 className="w-3 h-3 animate-spin" />}
                        {t('Save')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )})}

            {registries.length === 0 && (
              <div className="subsection-soft-panel px-4 py-6 text-center text-sm text-muted-foreground rounded-[1rem]">
                {t('No registries configured')}
              </div>
            )}
          </div>

          {/* Add Registry Form */}
          {showAddForm && (
            <div className="mt-4 p-4 subsection-soft-panel rounded-[1rem] space-y-3">
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">
                  {t('Name')}
                  <span className="text-red-400 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('Registry name')}
                  className="form-input-soft w-full px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">
                  {t('URL')}
                  <span className="text-red-400 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder={t('https://example.com/registry')}
                  className="form-input-soft w-full px-3 py-2 text-sm"
                />
              </div>

              {addError && (
                <p className="text-sm text-red-500">{addError}</p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { void handleAdd() }}
                  disabled={adding}
                  className="flex items-center gap-2 px-3 py-2 text-sm btn-primary text-primary-foreground rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {adding && <Loader2 className="w-4 h-4 animate-spin" />}
                  {adding ? t('Adding...') : t('Add')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false)
                    setNewName('')
                    setNewUrl('')
                    setAddError(null)
                  }}
                  className="px-3 py-2 text-sm text-muted-foreground surface-subtle hover:text-foreground rounded-xl transition-colors"
                >
                  {t('Cancel')}
                </button>
              </div>
            </div>
          )}

          {/* Add Registry Button */}
          {!showAddForm && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="mt-4 flex items-center gap-2 px-3 py-2 text-sm btn-primary text-primary-foreground rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('Add Registry')}
            </button>
          )}
        </>
      )}
    </section>
  )
}
