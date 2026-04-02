/**
 * Store Card
 *
 * Compact card showing app summary in the store grid.
 * Clicking navigates to the detail view.
 */

import type { RegistryEntry } from '../../../shared/store/store-types'
import { useTranslation, getCurrentLanguage } from '../../i18n'
import { resolveEntryI18n } from '../../utils/spec-i18n'
import { AppTypeBadge } from './AppTypeBadge'

interface StoreCardProps {
  entry: RegistryEntry
  onClick: () => void
  className?: string
  style?: React.CSSProperties
}

/** Max number of tags displayed on the card */
const MAX_VISIBLE_TAGS = 3

export function StoreCard({ entry, onClick, className = '', style }: StoreCardProps) {
  const { t } = useTranslation()
  const { name, description } = resolveEntryI18n(entry, getCurrentLanguage())
  const visibleTags = entry.tags.slice(0, MAX_VISIBLE_TAGS)

  return (
    <button
      onClick={onClick}
      style={style}
      className={`w-full text-left p-4 rounded-[1.1rem] border border-border/80 bg-card
        hover:border-primary/40 hover:bg-secondary/30 
        transition-colors duration-150 cursor-pointer
        active:translate-y-0 ${className}`}
    >
      {/* First line: icon + name + type badge + version */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {entry.icon && (
            <span className="text-base flex-shrink-0 w-8 h-8 rounded-lg bg-background/30 flex items-center justify-center">{entry.icon}</span>
          )}
          <span className="text-sm font-medium text-foreground truncate">
            {name}
          </span>
          <AppTypeBadge type={entry.type} />
        </div>
        <span className="text-xs text-muted-foreground flex-shrink-0">
          v{entry.version}
        </span>
      </div>

      {/* Author */}
      <p className="text-xs text-muted-foreground mt-1">
        {t('by')} {entry.author}
      </p>

      {/* Description (2 lines max) */}
      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
        {description}
      </p>

      {/* Tags */}
      {visibleTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {visibleTags.map(tag => (
            <span
              key={tag}
            className="text-xs px-2 py-0.5 rounded-full bg-secondary/80 text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}
