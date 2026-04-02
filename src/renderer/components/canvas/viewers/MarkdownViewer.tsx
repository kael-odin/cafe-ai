/**
 * Markdown Viewer - Rendered markdown with source toggle
 *
 * Features:
 * - Beautiful markdown rendering
 * - Toggle between rendered and source view
 * - Code block syntax highlighting
 * - Copy to clipboard
 * - Window maximize for fullscreen viewing
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Copy, Check, Code, Eye, ExternalLink, Pencil } from 'lucide-react'
import { Streamdown, type Components } from 'streamdown'
import 'streamdown/styles.css'
import { useCodePlugin } from '../../../lib/streamdown-plugins'
import { api } from '../../../api'
import type { CanvasTab } from '../../../stores/canvas.store'
import { useTranslation } from '../../../i18n'

const STREAMDOWN_CONTROLS = { code: true } as const

const MARKDOWN_VIEWER_COMPONENTS: Components = {
  table({ children }) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full">{children}</table>
      </div>
    )
  },
  a({ href, children }: { href?: string; children?: React.ReactNode }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  },
}

/**
 * Resolve relative image paths to Cafe-file:// protocol URLs
 * This bypasses cross-origin restrictions in dev mode (http://localhost -> file://)
 */
function resolveImageSrc(src: string | undefined, basePath: string): string {
  if (!src) return ''

  // Keep absolute URLs and data URIs as-is
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
    return src
  }

  // No base path available, return original
  if (!basePath) return src

  const normBase = basePath.replace(/\\/g, '/')
  const toCafeUrl = (p: string) => `cafe-file:///${encodeURI(p.replace(/\\/g, '/').replace(/^\/+/, ''))}`

  // Resolve relative paths to Cafe-file:// protocol
  if (src.startsWith('./')) {
    return toCafeUrl(`${normBase}/${src.slice(2)}`)
  }

  if (src.startsWith('../')) {
    const parts = normBase.split('/')
    const srcParts = src.split('/')
    while (srcParts[0] === '..') {
      parts.pop()
      srcParts.shift()
    }
    return toCafeUrl(`${parts.join('/')}/${srcParts.join('/')}`)
  }

  if (src.startsWith('/')) {
    return toCafeUrl(src)
  }

  // Relative path without prefix
  return toCafeUrl(`${normBase}/${src}`)
}

interface MarkdownViewerProps {
  tab: CanvasTab
  onScrollChange?: (position: number) => void
  onEditRequest?: () => void
}

export function MarkdownViewer({ tab, onScrollChange, onEditRequest }: MarkdownViewerProps): JSX.Element {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRafRef = useRef<number | null>(null)
  const [viewMode, setViewMode] = useState<'rendered' | 'source'>('rendered')
  const [copied, setCopied] = useState(false)
  const content = tab.content ?? ''
  const needsCodeHighlight = useMemo(
    () => content.includes('```') || content.includes('<code'),
    [content]
  )
  const codePlugin = useCodePlugin(needsCodeHighlight)
  const plugins = useMemo(
    () => (codePlugin ? { code: codePlugin } : undefined),
    [codePlugin]
  )

  // Get the base directory of the markdown file for resolving relative paths
  const normalizedPath = tab.path ? tab.path.replace(/\\/g, '/') : ''
  const basePath = normalizedPath ? normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) : ''

  // Restore scroll position
  useEffect(() => {
    if (containerRef.current && tab.scrollPosition !== undefined) {
      containerRef.current.scrollTop = tab.scrollPosition
    }
  }, [tab.id, tab.scrollPosition, viewMode])

  // Save scroll position
  const handleScroll = useCallback(() => {
    if (!containerRef.current || !onScrollChange) return
    if (scrollRafRef.current != null) return

    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      if (containerRef.current) {
        onScrollChange(containerRef.current.scrollTop)
      }
    })
  }, [onScrollChange])

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current)
      }
    }
  }, [])

  // Copy content
  const handleCopy = async (): Promise<void> => {
    if (!content) return
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Open with external application
  const handleOpenExternal = async (): Promise<void> => {
    if (!tab.path) return
    try {
      await api.openArtifact(tab.path)
    } catch (err) {
      console.error('Failed to open with external app:', err)
    }
  }

  const canOpenExternal = !api.isRemoteMode() && tab.path

  return (
    <div className="relative flex flex-col h-full bg-background">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/50 gap-3">
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center rounded-xl p-0.5 surface-subtle">
            <button
              onClick={() => setViewMode('rendered')}
              className={`
                flex items-center gap-1.5 px-2.5 py-1.5 rounded-[0.7rem] text-xs transition-colors
                ${viewMode === 'rendered'
                  ? 'toolbar-chip toolbar-chip-active text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
                }
              `}
            >
              <Eye className="w-3.5 h-3.5" />
              {t('Preview')}
            </button>
            <button
              onClick={() => setViewMode('source')}
              className={`
                flex items-center gap-1.5 px-2.5 py-1.5 rounded-[0.7rem] text-xs transition-colors
                ${viewMode === 'source'
                  ? 'toolbar-chip toolbar-chip-active text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
                }
              `}
            >
              <Code className="w-3.5 h-3.5" />
              {t('Source')}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Edit button */}
          {onEditRequest && (
            <button
              onClick={onEditRequest}
              className="p-1.5 rounded-xl surface-subtle hover:bg-secondary transition-colors"
              title={t('Edit')}
            >
              <Pencil className="w-4 h-4 text-muted-foreground" />
            </button>
          )}

          {/* Copy button */}
          <button
            onClick={() => { void handleCopy() }}
            className="p-1.5 rounded-xl surface-subtle hover:bg-secondary transition-colors"
            title={t('Copy')}
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {/* Open with external app */}
          {canOpenExternal && (
            <button
              onClick={() => { void handleOpenExternal() }}
              className="p-1.5 rounded-xl surface-subtle hover:bg-secondary transition-colors"
              title={t('Open in external application')}
            >
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto"
      >
        {viewMode === 'rendered' ? (
          <div className="prose prose-invert max-w-none p-6 sm:p-8 markdown-content">
            <Streamdown
              mode="static"
              controls={STREAMDOWN_CONTROLS}
              plugins={plugins}
              components={{
                ...MARKDOWN_VIEWER_COMPONENTS,
                // Style images - resolve relative paths using Cafe-file:// protocol
                img({ src, alt }: { src?: string; alt?: string }) {
                  return (
                    <img
                      src={resolveImageSrc(src, basePath)}
                      alt={alt}
                      className="h-auto rounded-lg"
                      // Don't stretch small images, limit large ones (like GitHub ~880px)
                      style={{ maxWidth: 'min(100%, 880px)' }}
                    />
                  )
                }
              }}
            >
              {content}
            </Streamdown>
          </div>
        ) : (
          <SourceView content={content} />
        )}
      </div>
    </div>
  )
}

/**
 * Source code view with line numbers
 */
function SourceView({ content }: { content: string }) {
  const lines = content.split('\n')

  return (
    <div className="flex font-mono text-sm">
      {/* Line numbers */}
      <div className="sticky left-0 flex-shrink-0 select-none bg-background border-r border-border/50 text-right text-muted-foreground/40 pr-3 pl-4 py-4 leading-6">
        {lines.map((_, i) => (
          <div key={i + 1}>
            {i + 1}
          </div>
        ))}
      </div>

      {/* Content */}
      <pre className="flex-1 py-4 pl-4 pr-4 overflow-x-auto whitespace-pre-wrap break-words leading-6 m-0">
        {content}
      </pre>
    </div>
  )
}
