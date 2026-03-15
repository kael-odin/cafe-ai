/**
 * Custom AI Source Provider
 *
 * Handles custom API configuration (Anthropic Claude or OpenAI compatible).
 * This is the simplest provider - no OAuth, just API key configuration.
 *
 * Design Notes:
 * - Stateless: all state comes from config
 * - No authentication flow needed
 * - Supports both Anthropic and OpenAI compatible endpoints
 *
 * Architecture Note (v2 Migration):
 * ================================
 * As of v2, the data structure changed from:
 *   v1: { current: 'custom', custom: {...}, 'github-copilot': {...} }
 *   v2: { version: 2, currentId: 'uuid', sources: AISource[] }
 *
 * For API Key providers (like 'custom'), the AISourceManager now handles
 * configuration directly from the AISource object, WITHOUT calling these
 * provider methods. These methods are kept for interface compliance but
 * are NOT called at runtime.
 *
 * For OAuth providers, the manager uses buildLegacyOAuthConfig() to convert
 * v2 AISource to v1 format before calling provider methods, ensuring backward
 * compatibility with external plugins.
 *
 * TODO: In a future major version, migrate provider interface to accept
 * AISource directly instead of legacy config format.
 */

import type {
  AISourceProvider,
  ProviderResult,
  ProviderConfig
} from '../../../../shared/interfaces'
import type {
  AISourceType,
  BackendRequestConfig,
  CustomSourceConfig,
  AISourcesConfig,
  AISource
} from '../../../../shared/types'
import { AVAILABLE_MODELS } from '../../../../shared/types'

/**
 * Anthropic API base URL
 */
const ANTHROPIC_API_URL = 'https://api.anthropic.com'

/**
 * Helper to check if config is legacy v1 format
 */
function isLegacyConfig(config: ProviderConfig): config is { current: string; custom?: CustomSourceConfig } {
  return 'current' in config && typeof (config as any).current === 'string'
}

/**
 * Helper to get current source from v2 config
 */
function getCurrentSourceFromConfig(config: AISourcesConfig): AISource | null {
  if (!config.currentId) return null
  return config.sources.find(s => s.id === config.currentId) || null
}

/**
 * Custom AI Source Provider Implementation
 *
 * NOTE: For 'custom' (API Key) providers, these methods are NOT called by
 * AISourceManager at runtime. The manager reads configuration directly from
 * the AISource object. These implementations exist only for interface
 * compliance and potential future use.
 */
export class CustomAISourceProvider implements AISourceProvider {
  readonly type: AISourceType = 'custom'
  readonly displayName = 'Custom API'

  private getCustomConfig(config: ProviderConfig): CustomSourceConfig | null {
    if (isLegacyConfig(config)) {
      return config.custom || null
    }
    const source = getCurrentSourceFromConfig(config as AISourcesConfig)
    if (!source || source.authType !== 'api-key') {
      return null
    }
    return {
      provider: source.provider as 'anthropic' | 'openai',
      apiKey: source.apiKey || '',
      apiUrl: source.apiUrl,
      model: source.model,
      id: source.id,
      name: source.name,
      type: 'custom',
      availableModels: source.availableModels.map((m: { id: string }) => m.id)
    }
  }

  isConfigured(config: ProviderConfig): boolean {
    const customConfig = this.getCustomConfig(config)
    return !!(customConfig?.apiKey)
  }

  getBackendConfig(config: ProviderConfig): BackendRequestConfig | null {
    const customConfig = this.getCustomConfig(config)
    if (!customConfig?.apiKey) {
      return null
    }

    const isAnthropic = customConfig.provider === 'anthropic'
    const baseUrl = customConfig.apiUrl || ANTHROPIC_API_URL

    const cleanBaseUrl = baseUrl.replace(/\/$/, '')

    return {
      url: cleanBaseUrl,
      key: customConfig.apiKey,
      model: customConfig.model,
      apiType: isAnthropic ? undefined : this.inferApiTypeFromUrl(cleanBaseUrl)
    }
  }

  private inferApiTypeFromUrl(url: string): 'chat_completions' | 'responses' {
    if (url.includes('/responses')) return 'responses'
    return 'chat_completions'
  }

  getCurrentModel(config: ProviderConfig): string | null {
    const customConfig = this.getCustomConfig(config)
    return customConfig?.model || null
  }

  async getAvailableModels(config: ProviderConfig): Promise<string[]> {
    const customConfig = this.getCustomConfig(config)
    if (!customConfig) {
      return []
    }

    if (customConfig.provider === 'anthropic') {
      return AVAILABLE_MODELS.map(m => m.id)
    }

    return []
  }

  async refreshConfig(_config: ProviderConfig): Promise<ProviderResult<Partial<ProviderConfig>>> {
    return { success: true, data: {} }
  }
}

let instance: CustomAISourceProvider | null = null

export function getCustomProvider(): CustomAISourceProvider {
  if (!instance) {
    instance = new CustomAISourceProvider()
  }
  return instance
}
