/**
 * Adapter Registry
 *
 * Maps sourceType strings to their adapter implementations.
 * Import this module to resolve the correct adapter for a registry source.
 */

import type { RegistryAdapter } from './types'
import { CafeAdapter } from './cafe.adapter'
import { McpRegistryAdapter } from './mcp-registry.adapter'
import { SmitheryAdapter } from './smithery.adapter'
import { ClaudeSkillsAdapter } from './claude-skills.adapter'
import type { RegistrySource } from '../../../shared/store/store-types'

// Singleton adapter instances (stateless, safe to share)
const cafeAdapter = new CafeAdapter()
const mcpRegistryAdapter = new McpRegistryAdapter()
const smitheryAdapter = new SmitheryAdapter()
const claudeSkillsAdapter = new ClaudeSkillsAdapter()

/**
 * Return the adapter for the given registry source.
 * Falls back to CafeAdapter when sourceType is absent (backward-compatible).
 */
export function getAdapter(source: RegistrySource): RegistryAdapter {
  switch (source.sourceType) {
    case 'mcp-registry':
      return mcpRegistryAdapter
    case 'smithery':
      return smitheryAdapter
    case 'claude-skills':
      return claudeSkillsAdapter
    case 'cafe':
    default:
      return cafeAdapter
  }
}

export type { RegistryAdapter }
