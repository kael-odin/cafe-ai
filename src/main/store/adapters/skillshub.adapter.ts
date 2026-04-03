/**
 * SkillsHub Adapter (Proxy Mode)
 *
 * Fetches from https://skillshub.wtf
 * API: GET /api/v1/skills/search?q=...&page=N&limit=50
 *      GET /api/v1/skills/resolve?task=... (smart skill matching)
 *
 * Features:
 * - 10,000+ skills from 230+ repos
 * - No auth required for search and fetch
 * - Smart skill resolver API
 * - Token-efficient (250x better than manual search)
 *
 * Proxy strategy: queries are forwarded on demand.
 */

import { fetchWithTimeout } from './cafe.adapter'
import { sanitizeSlug } from './mcp-registry.adapter'
import type { RegistrySource, RegistryEntry, StoreQueryParams } from '../../../shared/store/store-types'
import type { AppSpec, SkillSpec } from '../../apps/spec/schema'
import type { RegistryAdapter, AdapterQueryResult } from './types'

// ── External API types ─────────────────────────────────────────────────────

interface SkillsHubSkill {
  id: string
  slug: string
  name: string
  description?: string
  tags?: string[]
  stars?: number
  downloads?: number
  repo?: {
    githubOwner: string
    githubRepoName: string
  }
  fetchUrl?: string
}

interface SkillsHubSearchResponse {
  data: SkillsHubSkill[]
  total: number
  page: number
  hasMore: boolean
}

interface SkillsHubResolveResponse {
  data: Array<{
    skill: SkillsHubSkill
    score: number
    confidence: number
    fetchUrl: string
  }>
  query: string
  matched: number
}

// ── Adapter ────────────────────────────────────────────────────────────────

export class SkillsHubAdapter implements RegistryAdapter {
  readonly strategy = 'proxy' as const

  async query(source: RegistrySource, params: StoreQueryParams): Promise<AdapterQueryResult> {
    const baseUrl = source.url.replace(/\/+$/, '')
    const limit = params.pageSize || 50
    const t0 = performance.now()

    // Use resolve API for natural language queries, search API for keywords
    const searchQuery = params.search ?? ''
    const url = `${baseUrl}/api/v1/skills/search?q=${encodeURIComponent(searchQuery)}&page=${params.page}&limit=${limit}`

    const response = await fetchWithTimeout(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Cafe-Store/1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json() as SkillsHubSearchResponse
    const items = mapSkillsHubSkills(data.data ?? [])

    const dt = performance.now() - t0
    console.log(`[SkillsHubAdapter] query page ${params.page}: ${items.length} results (${dt.toFixed(0)}ms)`)

    return {
      items,
      total: data.total,
      hasMore: data.hasMore ?? false,
    }
  }

  async fetchSpec(source: RegistrySource, entry: RegistryEntry): Promise<AppSpec> {
    const baseUrl = source.url.replace(/\/+$/, '')
    
    // entry.path contains the fetchUrl or owner/repo/slug format
    let fetchUrl: string
    if (entry.path?.startsWith('http')) {
      fetchUrl = entry.path
    } else if (entry.meta?.fetchUrl) {
      fetchUrl = entry.meta.fetchUrl as string
    } else {
      // Construct from repo info
      const owner = entry.author || 'unknown'
      const repo = entry.meta?.repo || 'skills'
      fetchUrl = `${baseUrl}/${owner}/${repo}/${entry.slug}?format=md`
    }

    // Fetch the SKILL.md content
    const response = await fetchWithTimeout(fetchUrl, {
      headers: {
        'Accept': 'text/markdown',
        'User-Agent': 'Cafe-Store/1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch skill content: HTTP ${response.status}`)
    }

    const skillContent = await response.text()

    const spec: SkillSpec = {
      spec_version: '1',
      name: entry.name,
      type: 'skill',
      version: entry.version,
      author: entry.author,
      description: entry.description,
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

function mapSkillsHubSkills(skills: SkillsHubSkill[]): RegistryEntry[] {
  const apps: RegistryEntry[] = []
  const seenSlugs = new Set<string>()

  for (const skill of skills) {
    if (!skill.name && !skill.slug) continue

    const slug = sanitizeSlug(skill.slug || skill.name || 'unknown')
    if (!slug || seenSlugs.has(slug)) continue
    seenSlugs.add(slug)

    const author = skill.repo?.githubOwner || 'community'
    const repo = skill.repo?.githubRepoName || 'skills'

    apps.push({
      slug,
      name: skill.name || skill.slug,
      version: '1.0.0',
      author,
      description: skill.description || skill.name || 'No description',
      type: 'skill',
      format: 'bundle',
      path: skill.fetchUrl || `${author}/${repo}/${slug}`,
      category: 'other',
      tags: skill.tags || [],
      meta: {
        stars: skill.stars,
        downloads: skill.downloads,
        repo: repo,
        fetchUrl: skill.fetchUrl,
      },
    })
  }

  return apps
}
