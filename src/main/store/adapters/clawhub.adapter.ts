/**
 * ClawHub Adapter (Proxy Mode)
 *
 * Fetches from https://clawhub.io (OpenClaw official skills registry)
 * API: GET /api/skills?q=...&page=N&limit=50
 *      GET /api/skills/:owner/:repo/:slug
 *
 * Features:
 * - 21,000+ skills from OpenClaw community
 * - Official OpenClaw skills marketplace
 * - SKILL.md format compatible
 * - No auth required for public skills
 *
 * Proxy strategy: queries are forwarded on demand.
 */

import { fetchWithTimeout } from './cafe.adapter'
import { sanitizeSlug } from './mcp-registry.adapter'
import type { RegistrySource, RegistryEntry, StoreQueryParams } from '../../../shared/store/store-types'
import type { AppSpec, SkillSpec } from '../../apps/spec/schema'
import type { RegistryAdapter, AdapterQueryResult } from './types'

// ── External API types ─────────────────────────────────────────────────────

interface ClawHubSkill {
  id: string
  slug: string
  name: string
  description?: string
  author?: string
  owner?: string
  repo?: string
  path?: string
  tags?: string[]
  stars?: number
  downloads?: number
  version?: string
  install?: string  // "owner/repo/path/to/SKILL.md"
}

interface ClawHubSearchResponse {
  skills: ClawHubSkill[]
  total: number
  page: number
  totalPages: number
  hasMore: boolean
}

interface ClawHubSkillDetail {
  name: string
  description?: string
  content: string  // SKILL.md content
  author?: string
  version?: string
}

// ── Adapter ────────────────────────────────────────────────────────────────

export class ClawHubAdapter implements RegistryAdapter {
  readonly strategy = 'proxy' as const

  async query(source: RegistrySource, params: StoreQueryParams): Promise<AdapterQueryResult> {
    const baseUrl = source.url.replace(/\/+$/, '')
    const limit = params.pageSize || 50
    const t0 = performance.now()

    const searchQuery = params.search ?? ''
    const url = `${baseUrl}/api/skills?q=${encodeURIComponent(searchQuery)}&page=${params.page}&limit=${limit}`

    const response = await fetchWithTimeout(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Cafe-Store/1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json() as ClawHubSearchResponse
    const items = mapClawHubSkills(data.skills ?? [])

    const dt = performance.now() - t0
    console.log(`[ClawHubAdapter] query page ${params.page}/${data.totalPages || 1}: ${items.length} results (${dt.toFixed(0)}ms)`)

    return {
      items,
      total: data.total,
      hasMore: data.hasMore ?? (params.page < (data.totalPages || 1)),
    }
  }

  async fetchSpec(source: RegistrySource, entry: RegistryEntry): Promise<AppSpec> {
    const baseUrl = source.url.replace(/\/+$/, '')
    
    // Construct fetch URL from entry info
    let fetchUrl: string
    if (entry.path?.startsWith('http')) {
      fetchUrl = entry.path
    } else if (entry.path) {
      // entry.path is in format "owner/repo/path/to/SKILL.md"
      const parts = entry.path.split('/')
      if (parts.length >= 2) {
        const owner = parts[0]
        const repo = parts[1]
        const skillPath = parts.slice(2).join('/')
        fetchUrl = `${baseUrl}/api/skills/${owner}/${repo}/${skillPath.replace('/SKILL.md', '')}`
      } else {
        fetchUrl = `${baseUrl}/api/skills/${entry.path}`
      }
    } else {
      fetchUrl = `${baseUrl}/api/skills/${entry.author}/${entry.slug}`
    }

    // Fetch the skill content
    const response = await fetchWithTimeout(fetchUrl, {
      headers: {
        'Accept': 'application/json, text/markdown',
        'User-Agent': 'Cafe-Store/1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch skill content: HTTP ${response.status}`)
    }

    // Try to parse as JSON first, then as markdown
    let skillContent: string
    let skillData: ClawHubSkillDetail | null = null
    
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      try {
        skillData = await response.json() as ClawHubSkillDetail
        skillContent = skillData.content
      } catch {
        skillContent = await response.text()
      }
    } else {
      skillContent = await response.text()
    }

    const spec: SkillSpec = {
      spec_version: '1',
      name: skillData?.name || entry.name,
      type: 'skill',
      version: skillData?.version || entry.version,
      author: skillData?.author || entry.author,
      description: skillData?.description || entry.description,
      system_prompt: skillContent,
      skill_content: skillContent,
      store: {
        slug: entry.slug,
        registry_id: source.id,
      },
    }

    return spec
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mapClawHubSkills(skills: ClawHubSkill[]): RegistryEntry[] {
  const apps: RegistryEntry[] = []
  const seenSlugs = new Set<string>()

  for (const skill of skills) {
    if (!skill.name && !skill.slug) continue

    const slug = sanitizeSlug(skill.slug || skill.name || 'unknown')
    if (!slug || seenSlugs.has(slug)) continue
    seenSlugs.add(slug)

    // Parse install path if available
    let author = skill.author || skill.owner || 'community'
    let repo = skill.repo || 'skills'
    let path = skill.path || skill.install || ''

    if (skill.install) {
      // Format: "owner/repo/path/to/SKILL.md"
      const parts = skill.install.split('/')
      if (parts.length >= 2) {
        author = parts[0]
        repo = parts[1]
        path = skill.install
      }
    }

    apps.push({
      slug,
      name: skill.name || skill.slug,
      version: skill.version || '1.0.0',
      author,
      description: skill.description || skill.name || 'No description',
      type: 'skill',
      format: 'bundle',
      path,
      category: 'other',
      tags: skill.tags || [],
      meta: {
        stars: skill.stars,
        downloads: skill.downloads,
        repo,
        owner: skill.owner,
      },
    })
  }

  return apps
}
