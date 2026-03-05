/**
 * AI Browser Tools - Shared helpers and constants
 *
 * Utility functions used across multiple tool categories.
 */

import type { BrowserContext } from '../context'

// ============================================
// Constants
// ============================================

/** Default per-tool timeout (ms). Individual tools may override. */
export const TOOL_TIMEOUT = 60_000
/** Default navigation wait timeout (ms). */
export const NAV_TIMEOUT = 30_000

// ============================================
// Helpers
// ============================================

/** Convenience: wrap a promise with a timeout guard. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      v => { clearTimeout(timer); resolve(v) },
      e => { clearTimeout(timer); reject(e) }
    )
  })
}

/** Build a standard text content response. */
export function textResult(text: string, isError = false) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(isError ? { isError: true } : {})
  }
}

/** Build an image + text content response. */
export function imageResult(text: string, data: string, mimeType: string) {
  return {
    content: [
      { type: 'text' as const, text },
      { type: 'image' as const, data, mimeType }
    ]
  }
}

/**
 * Determine how to fill a form element, handling combobox disambiguation.
 */
export async function fillFormElement(ctx: BrowserContext, uid: string, value: string): Promise<void> {
  const element = ctx.getElementByUid(uid)

  if (element && element.role === 'combobox') {
    const hasOptions = element.children?.some(child => child.role === 'option')
    if (hasOptions) {
      try {
        await ctx.selectOption(uid, value)
        return
      } catch (e) {
        // Only fall back for "option not found" — rethrow infrastructure errors (CDP failures, etc.)
        if (!(e instanceof Error) || !e.message.includes('Could not find option')) {
          throw e
        }
        // No matching option — combobox may be editable, fall back to text input
      }
    }
    // Editable combobox (no options, or no matching option) — fill as text
    await ctx.fillElement(uid, value)
    return
  }

  await ctx.fillElement(uid, value)
}
