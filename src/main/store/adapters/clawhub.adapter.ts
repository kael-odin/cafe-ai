/**
 * ClawHub Adapter (Proxy Mode)
 *
 * ClawHub (https://clawhub.ai) 是 OpenClaw 官方的技能注册中心。
 * 
 * API 端点:
 * - Convex API: https://wry-manatee-359.convex.cloud/api/query
 * - 方法: POST
 * - 格式: Convex encoded JSON
 * 
 * 请求格式:
 * {
 *   "path": "skills:listPublicPageV4",
 *   "format": "convex_encoded_json",
 *   "args": [{...}]
 * }
 * 
 * 响应格式:
 * {
 *   "status": "success",
 *   "value": {
 *     "hasMore": boolean,
 *     "nextCursor": string,
 *     "page": [...]
 *   }
 * }
 *
 * Skill content download:
 * - File manifest: GET https://api.skillhub.tencent.com/api/v1/skills/{slug}/files
 * - Content: GET https://skillhub-1388575217.cos.accelerate.myqcloud.com/skills/{slug}/{version}/files/SKILL.md
 *
 * Proxy strategy: queries forwarded on demand, results not cached in SQLite.
 * Only SKILL.md is downloaded at install time.
 */

import { fetchWithTimeout } from './cafe.adapter'
import type { RegistrySource, RegistryEntry, StoreQueryParams } from '../../../shared/store/store-types'
import type { AppSpec, SkillSpec } from '../../apps/spec/schema'
import type { RegistryAdapter, AdapterQueryResult } from './types'

// ── Constants ──────────────────────────────────────────────────────────────

const CONVEX_API_BASE = 'https://wry-manatee-359.convex.cloud/api'
const SKILLHUB_API_BASE = 'https://api.skillhub.tencent.com'
const COS_BASE = 'https://skillhub-1388575217.cos.accelerate.myqcloud.com'
const DEFAULT_HEADERS: Record<string, string> = {
  'Accept': 'application/json',
  'User-Agent': 'Cafe-Store/1.0',
}
const CONVEX_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'convex-client': 'npm-1.34.1',
}

// ── External API types ─────────────────────────────────────────────────────

interface ClawHubSkill {
  skill: {
    _id: string
    _creationTime: number
    displayName: string
    slug: string
    summary: string
    stats: {
      downloads: number
      stars: number
      installsAllTime: number
      installsCurrent: number
      versions: number
      comments: number
    }
    tags?: Record<string, string>
    updatedAt: number
    createdAt: number
  }
  owner: {
    _id: string
    displayName: string
    handle: string
    image?: string
    kind: string
  }
  ownerHandle: string
  latestVersion: {
    _id: string
    version: string
    changelog?: string
    createdAt: number
  }
}

interface ClawHubResponse {
  status: 'success' | 'error'
  value?: {
    hasMore: boolean
    nextCursor?: string
    page: ClawHubSkill[]
  }
  errorMessage?: string
}

interface SkillsHubFilesResponse {
  count: number
  version: string
  files: Array<{
    path: string
    sha256?: string
    size?: number
  }>
}

// ── Adapter ────────────────────────────────────────────────────────────────

export class ClawHubAdapter implements RegistryAdapter {
  readonly strategy = 'proxy' as const

  async query(source: RegistrySource, params: StoreQueryParams): Promise<AdapterQueryResult> {
    const { search, page = 1, pageSize = 30 } = params

    // 构建 Convex 查询请求
    const requestBody = {
      path: 'skills:listPublicPageV4',
      format: 'convex_encoded_json',
      args: [{
        dir: 'desc',
        highlightedOnly: false,
        nonSuspiciousOnly: false,
        numItems: pageSize,
        sort: 'downloads',
        // 如果有搜索关键词，添加到 args
        ...(search ? { searchQuery: search } : {}),
        // 分页：使用 cursor 或页码
        ...(page > 1 ? { cursor: await this.getCursorForPage(page, pageSize) } : {}),
      }],
    }

    console.log(`[ClawHub] Fetching page ${page}, pageSize ${pageSize}`)

    try {
      const response = await fetchWithTimeout(`${CONVEX_API_BASE}/query`, {
        method: 'POST',
        headers: CONVEX_HEADERS,
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`ClawHub API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json() as ClawHubResponse

      if (data.status !== 'success' || !data.value) {
        throw new Error(`ClawHub API error: ${data.errorMessage || 'Unknown error'}`)
      }

      // 转换为 RegistryEntry 格式
      const items: RegistryEntry[] = data.value.page.map(skill => this.skillToEntry(skill))

      console.log(`[ClawHub] Fetched ${items.length} skills, hasMore: ${data.value.hasMore}`)

      return {
        items,
        total: undefined, // Convex API 不返回总数
        hasMore: data.value.hasMore,
      }
    } catch (error) {
      console.error('[ClawHub] Query failed:', error)
      throw error
    }
  }

  async fetchSpec(source: RegistrySource, entry: RegistryEntry): Promise<AppSpec> {
    const slug = entry.slug
    const t0 = performance.now()

    // Step 1: Get the files manifest via SkillsHub API to resolve the current version
    // ClawHub and SkillsHub share the same OpenClaw skill ecosystem
    const filesUrl = `${SKILLHUB_API_BASE}/api/v1/skills/${slug}/files`
    const filesRes = await fetchWithTimeout(filesUrl, { headers: DEFAULT_HEADERS })
    if (!filesRes.ok) {
      throw new Error(`ClawHub files API error HTTP ${filesRes.status} for "${slug}"`)
    }

    const filesData = await filesRes.json() as SkillsHubFilesResponse
    const version = filesData.version
    if (!version) {
      throw new Error(`ClawHub files API returned no version for "${slug}"`)
    }

    // Step 2: Download SKILL.md from Tencent COS (open CORS, no auth)
    const skillMdUrl = `${COS_BASE}/skills/${slug}/${version}/files/SKILL.md`
    const mdRes = await fetchWithTimeout(skillMdUrl, {
      headers: { 'User-Agent': 'Cafe-Store/1.0' },
    })

    if (!mdRes.ok) {
      throw new Error(
        `ClawHub: failed to download SKILL.md for "${slug}" v${version}: HTTP ${mdRes.status}`
      )
    }

    const skillMdContent = await mdRes.text()

    const dt = performance.now() - t0
    console.log(`[ClawHub] fetched spec for "${slug}" v${version} (${dt.toFixed(0)}ms)`)

    const spec: SkillSpec = {
      spec_version: '1',
      name: entry.name,
      type: 'skill',
      version: entry.version,
      description: entry.description,
      author: entry.author,
      skill_files: {
        'SKILL.md': skillMdContent,
      },
      store: {
        slug: entry.slug,
        registry_id: source.id,
      },
    }

    return spec
  }

  /**
   * 将 ClawHub 技能转换为 RegistryEntry 格式
   */
  private skillToEntry(skill: ClawHubSkill): RegistryEntry {
    return {
      slug: skill.skill.slug,
      name: skill.skill.displayName,
      version: skill.latestVersion?.version || '1.0.0',
      author: skill.owner.displayName || skill.ownerHandle || 'Unknown',
      description: skill.skill.summary || skill.skill.displayName,
      type: 'skill',
      format: 'bundle',
      path: skill.skill.slug,
      category: 'other',
      tags: skill.skill.tags ? Object.keys(skill.skill.tags) : [],
      icon: skill.owner.image,
      created_at: new Date(skill.skill.createdAt).toISOString(),
      updated_at: new Date(skill.skill.updatedAt).toISOString(),
      meta: {
        downloads: skill.skill.stats.downloads,
        stars: skill.skill.stats.stars,
        installsAllTime: skill.skill.stats.installsAllTime,
        installsCurrent: skill.skill.stats.installsCurrent,
        versions: skill.skill.stats.versions,
        ownerHandle: skill.ownerHandle,
        ownerId: skill.owner._id,
        skillId: skill.skill._id,
      },
    }
  }

  /**
   * 获取指定页的 cursor（用于分页）
   * 
   * Convex 使用 cursor 进行分页，需要先获取前一页的 nextCursor
   * 这是一个简化的实现，实际使用时可能需要缓存 cursor
   */
  private async getCursorForPage(page: number, pageSize: number): Promise<string | undefined> {
    // 简化实现：对于第 2 页及以后，需要先查询前一页获取 cursor
    // 实际生产环境中应该缓存 cursor
    if (page === 1) return undefined

    // 递归获取前一页的 cursor
    let cursor: string | undefined
    for (let i = 1; i < page; i++) {
      const requestBody = {
        path: 'skills:listPublicPageV4',
        format: 'convex_encoded_json',
        args: [{
          dir: 'desc',
          highlightedOnly: false,
          nonSuspiciousOnly: false,
          numItems: pageSize,
          sort: 'downloads',
          ...(cursor ? { cursor } : {}),
        }],
      }

      const response = await fetchWithTimeout(`${CONVEX_API_BASE}/query`, {
        method: 'POST',
        headers: CONVEX_HEADERS,
        body: JSON.stringify(requestBody),
      })

      const data = await response.json() as ClawHubResponse
      if (data.status === 'success' && data.value?.nextCursor) {
        cursor = data.value.nextCursor
      } else {
        break
      }
    }

    return cursor
  }
}
