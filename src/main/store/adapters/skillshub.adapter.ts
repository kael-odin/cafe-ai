/**
 * SkillsHub Adapter (Proxy Mode)
 *
 * SkillsHub (https://skillhub.tencent.com) 是腾讯提供的技能市场。
 * 
 * API 端点:
 * - 列表: GET https://api.skillhub.tencent.com/api/skills
 * - 参数: page, pageSize, sortBy, order, keyword
 * - 文件清单: GET https://api.skillhub.tencent.com/api/v1/skills/{slug}/files
 * - 内容下载: GET https://skillhub-1388575217.cos.accelerate.myqcloud.com/skills/{slug}/{version}/files/SKILL.md
 * 
 * 响应格式:
 * {
 *   code: 0,
 *   data: {
 *     list: [...],
 *     total: number,
 *     page: number,
 *     pageSize: number
 *   },
 *   message: 'success'
 * }
 *
 * Proxy strategy: queries forwarded on demand, results not cached in SQLite.
 * Only SKILL.md is downloaded at install time.
 */

import { fetchWithTimeout } from './cafe.adapter'
import type { RegistrySource, RegistryEntry, StoreQueryParams } from '../../../shared/store/store-types'
import type { AppSpec, SkillSpec } from '../../apps/spec/schema'
import type { RegistryAdapter, AdapterQueryResult } from './types'

// ── Constants ──────────────────────────────────────────────────────────────

const API_BASE = 'https://api.skillhub.tencent.com'
const COS_BASE = 'https://skillhub-1388575217.cos.accelerate.myqcloud.com'
const DEFAULT_HEADERS: Record<string, string> = {
  'Accept': 'application/json',
  'User-Agent': 'Cafe-Store/1.0',
}

// ── External API types ─────────────────────────────────────────────────────

interface SkillsHubSkill {
  name: string
  slug: string
  description: string
  description_zh?: string
  ownerName: string
  version: string
  tags?: string[] | null
  category: string
  homepage?: string
  downloads: number
  installs?: number
  score: number
  stars?: number
  source?: string
  iconUrl?: string | null
  created_at: number
  updated_at: number
}

interface SkillsHubResponse {
  code: number
  data: {
    list?: SkillsHubSkill[]
    skills?: SkillsHubSkill[]
    items?: SkillsHubSkill[]
    total: number
    page?: number
    pageSize?: number
  }
  message: string
}

interface SkillsHubFileEntry {
  path: string
  sha256?: string
  size?: number
}

interface SkillsHubFilesResponse {
  count: number
  version: string
  files: SkillsHubFileEntry[]
}

// ── Adapter ────────────────────────────────────────────────────────────────

export class SkillsHubAdapter implements RegistryAdapter {
  readonly strategy = 'proxy' as const

  async query(source: RegistrySource, params: StoreQueryParams): Promise<AdapterQueryResult> {
    const { search, page = 1, pageSize = 30 } = params

    // 构建 URL
    const url = new URL(`${API_BASE}/api/skills`)
    url.searchParams.set('page', String(page))
    url.searchParams.set('pageSize', String(pageSize))
    url.searchParams.set('sortBy', 'score')
    url.searchParams.set('order', 'desc')

    // 如果有搜索关键词，添加到 URL
    if (search) {
      url.searchParams.set('keyword', search)
    }

    console.log(`[SkillsHub] Fetching: ${url.toString()}`)

    try {
      const response = await fetchWithTimeout(url.toString(), {
        method: 'GET',
        headers: DEFAULT_HEADERS,
      })

      if (!response.ok) {
        throw new Error(`SkillsHub API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json() as SkillsHubResponse

      if (data.code !== 0) {
        throw new Error(`SkillsHub API error: ${data.message}`)
      }

      // 检查实际的列表字段名（可能是 list、skills 或 items）
      const skillList = data.data.list || data.data.skills || data.data.items || []
      
      // 转换为 RegistryEntry 格式
      const items: RegistryEntry[] = skillList
        .map(skill => this.skillToEntry(skill))
        .filter((e): e is RegistryEntry => e !== null)

      console.log(`[SkillsHub] Fetched ${items.length} skills, total: ${data.data.total}`)

      return {
        items,
        total: data.data.total,
        hasMore: page * pageSize < data.data.total,
      }
    } catch (error) {
      console.error('[SkillsHub] Query failed:', error)
      throw error
    }
  }

  async fetchSpec(source: RegistrySource, entry: RegistryEntry): Promise<AppSpec> {
    const slug = entry.slug
    const t0 = performance.now()

    // Step 1: Get the files manifest to resolve the current version
    const filesUrl = `${API_BASE}/api/v1/skills/${slug}/files`
    const filesRes = await fetchWithTimeout(filesUrl, { headers: DEFAULT_HEADERS })
    if (!filesRes.ok) {
      throw new Error(`SkillsHub files API error HTTP ${filesRes.status} for "${slug}"`)
    }

    const filesData = await filesRes.json() as SkillsHubFilesResponse
    const version = filesData.version
    if (!version) {
      throw new Error(`SkillsHub files API returned no version for "${slug}"`)
    }

    // Step 2: Download SKILL.md from Tencent COS (open CORS, no auth)
    const skillMdUrl = `${COS_BASE}/skills/${slug}/${version}/files/SKILL.md`
    const mdRes = await fetchWithTimeout(skillMdUrl, {
      headers: { 'User-Agent': 'Cafe-Store/1.0' },
    })

    if (!mdRes.ok) {
      throw new Error(
        `SkillsHub: failed to download SKILL.md for "${slug}" v${version}: HTTP ${mdRes.status}`
      )
    }

    const skillMdContent = await mdRes.text()

    const dt = performance.now() - t0
    console.log(`[SkillsHub] fetched spec for "${slug}" v${version} (${dt.toFixed(0)}ms)`)

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
   * 将 SkillsHub 技能转换为 RegistryEntry 格式
   */
  private skillToEntry(skill: SkillsHubSkill): RegistryEntry | null {
    if (!skill.slug || !skill.name) return null

    // 优先使用中文描述，如果不存在则使用英文描述
    const description = skill.description_zh || skill.description || skill.name
    
    return {
      slug: skill.slug,
      name: skill.name,
      version: skill.version || '1.0.0',
      author: skill.ownerName || 'Unknown',
      description,
      type: 'skill',
      format: 'bundle',
      path: skill.slug,
      category: skill.category || 'other',
      tags: skill.tags || [],
      icon: skill.iconUrl ?? skill.homepage,
      created_at: new Date(skill.created_at).toISOString(),
      updated_at: new Date(skill.updated_at).toISOString(),
      i18n: skill.description_zh
        ? { 'zh-CN': { description: skill.description_zh } }
        : undefined,
      meta: {
        downloads: skill.downloads,
        installs: skill.installs,
        score: skill.score,
        stars: skill.stars,
        source: skill.source,
        description_zh: skill.description_zh,
        description_en: skill.description,
      },
    }
  }
}
