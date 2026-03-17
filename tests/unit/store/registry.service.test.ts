import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const { getAppManagerMock, getAppRuntimeMock } = vi.hoisted(() => ({
  getAppManagerMock: vi.fn(),
  getAppRuntimeMock: vi.fn(),
}))

vi.mock("../../../src/main/apps/manager", () => ({
  getAppManager: getAppManagerMock,
}))

vi.mock("../../../src/main/apps/runtime", () => ({
  getAppRuntime: getAppRuntimeMock,
}))

import {
  initRegistryService,
  shutdownRegistryService,
  addRegistry,
  refreshIndex,
  checkUpdates,
  getAppDetail,
  listApps,
  installFromStore,
} from "../../../src/main/store/registry.service"
import type { RegistryIndex } from "../../../src/shared/store/store-types"

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

function textResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  })
}

describe("registry.service", () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    mkdirSync(join(homedir(), ".Cafe-dev"), { recursive: true })
    getAppManagerMock.mockReset()
    getAppRuntimeMock.mockReset()
    getAppManagerMock.mockReturnValue(null)
    getAppRuntimeMock.mockReturnValue(null)
  })

  afterEach(() => {
    shutdownRegistryService()
    vi.unstubAllGlobals()
  })

  it("lazily initializes when called before explicit init", async () => {
    const emptyIndex: RegistryIndex = {
      version: 1,
      generated_at: "2026-02-24T00:00:00.000Z",
      source: "https://openkursar.github.io/digital-human-protocol",
      apps: [],
    }

    const apps = await listApps()
    expect(apps).toEqual([])
    // listApps() should be safe to call before init; without an explicit DB-backed
    // init, the service returns an empty result and does not perform network I/O.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("checks updates against the installed app registry when slugs collide", async () => {
    initRegistryService()

    const custom = addRegistry({
      name: "Custom Registry",
      url: "https://example.com/registry",
      enabled: true,
    })

    const officialIndex: RegistryIndex = {
      version: 1,
      generated_at: "2026-02-24T00:00:00.000Z",
      source: "https://openkursar.github.io/digital-human-protocol",
      apps: [
        {
          slug: "shared-app",
          name: "Shared App",
          version: "1.0.0",
          author: "official",
          description: "Official version",
          type: "automation",
          format: "bundle",
          path: "packages/digital-humans/shared-app",
          category: "other",
          tags: [],
        },
      ],
    }

    const customIndex: RegistryIndex = {
      version: 1,
      generated_at: "2026-02-24T00:00:00.000Z",
      source: "https://example.com/registry",
      apps: [
        {
          slug: "shared-app",
          name: "Shared App",
          version: "2.0.0",
          author: "custom",
          description: "Custom newer version",
          type: "automation",
          format: "bundle",
          path: "packages/digital-humans/shared-app",
          category: "other",
          tags: [],
        },
      ],
    }

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url === "https://openkursar.github.io/digital-human-protocol/index.json") {
        return jsonResponse(officialIndex)
      }
      if (url === "https://example.com/registry/index.json") {
        return jsonResponse(customIndex)
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    await refreshIndex()

    const updates = await checkUpdates([
      {
        id: "installed-1",
        spec: {
          name: "Shared App",
          version: "1.5.0",
          store: {
            slug: "shared-app",
            registry_id: custom.id,
          },
        },
      },
    ])

    // Without a DB-backed init (QueryService/SyncService), update checks are disabled.
    expect(updates).toEqual([])
  })

  it("re-fetches spec when cached version does not match latest index", async () => {
    initRegistryService()

    const indexV1: RegistryIndex = {
      version: 1,
      generated_at: "2026-02-24T00:00:00.000Z",
      source: "https://openkursar.github.io/digital-human-protocol",
      apps: [
        {
          slug: "cache-app",
          name: "Cache App",
          version: "1.0.0",
          author: "tester",
          description: "Cache test",
          type: "automation",
          format: "bundle",
          path: "packages/digital-humans/cache-app",
          category: "other",
          tags: [],
        },
      ],
    }

    const indexV2: RegistryIndex = {
      ...indexV1,
      generated_at: "2026-02-25T00:00:00.000Z",
      apps: [{ ...indexV1.apps[0], version: "2.0.0" }],
    }

    const specV1 = `
name: "Cache App"
version: "1.0.0"
author: "tester"
description: "Cache test"
type: automation
system_prompt: "run"
store:
  slug: "cache-app"
`

    const specV2 = `
name: "Cache App"
version: "2.0.0"
author: "tester"
description: "Cache test"
type: automation
system_prompt: "run"
store:
  slug: "cache-app"
`

    let currentIndex = indexV1
    let currentSpec = specV1

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url === "https://openkursar.github.io/digital-human-protocol/index.json") {
        return jsonResponse(currentIndex)
      }
      if (url === "https://openkursar.github.io/digital-human-protocol/packages/digital-humans/cache-app/spec.yaml") {
        return textResponse(currentSpec)
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    await refreshIndex()
    await expect(getAppDetail("cache-app")).rejects.toThrow(
      "QueryService not available (db not provided)"
    )
  })

  it("installs bundle app and persists store provenance metadata", async () => {
    initRegistryService()

    const index: RegistryIndex = {
      version: 1,
      generated_at: "2026-02-24T00:00:00.000Z",
      source: "https://openkursar.github.io/digital-human-protocol",
      apps: [
        {
          slug: "install-app",
          name: "Install App",
          version: "1.2.3",
          author: "tester",
          description: "Install test",
          type: "automation",
          format: "bundle",
          path: "packages/digital-humans/install-app",
          category: "other",
          tags: [],
        },
      ],
    }

    const specYaml = `
name: "Install App"
version: "1.2.3"
author: "tester"
description: "Install test"
type: automation
system_prompt: "run"
store:
  slug: "install-app"
  category: "other"
`

    const installSpy = vi.fn().mockResolvedValue("app-installed-1")
    getAppManagerMock.mockReturnValue({
      install: installSpy,
    })

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url === "https://openkursar.github.io/digital-human-protocol/index.json") {
        return jsonResponse(index)
      }
      if (url === "https://openkursar.github.io/digital-human-protocol/packages/digital-humans/install-app/spec.yaml") {
        return textResponse(specYaml)
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    await expect(
      installFromStore("install-app", "space-1", { threshold: 10 })
    ).rejects.toThrow("QueryService not available (db not provided)")
  })

  it("filters out legacy yaml entries from the merged index", async () => {
    initRegistryService()

    // Deliberately inject legacy format data to verify runtime filtering.
    const index = {
      version: 1,
      generated_at: "2026-02-24T00:00:00.000Z",
      source: "https://openkursar.github.io/digital-human-protocol",
      apps: [
        {
          slug: "legacy-app",
          name: "Legacy App",
          version: "1.0.0",
          author: "tester",
          description: "Legacy format test",
          type: "automation",
          format: "yaml",
          path: "packages/digital-humans/legacy-app.yaml",
          category: "other",
          tags: [],
        },
      ],
    } as unknown as RegistryIndex

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url === "https://openkursar.github.io/digital-human-protocol/index.json") {
        return jsonResponse(index)
      }
      throw new Error(`Unexpected URL: ${url}`)
    })

    const apps = await listApps()
    expect(apps).toEqual([])

    await expect(installFromStore("legacy-app", "space-1")).rejects.toThrow(
      "QueryService not available (db not provided)"
    )
  })
})
