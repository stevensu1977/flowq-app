/**
 * RSS Integration Component
 *
 * Collapsible card for managing RSS feed subscriptions
 * Matches the unified integration card pattern
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw,
  Plus,
  Trash2,
  AlertCircle,
  Check,
  X,
  Rss,
  ChevronDown,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import { getRSSManager, type RSSManager } from '../lib/rss'
import type { StoredFeed, StoredCategory } from '../lib/tauri-api'
import { SUGGESTED_RSS_FEEDS } from '../types'

interface RSSIntegrationProps {
  onFeedsChange?: (feeds: StoredFeed[]) => void
  defaultExpanded?: boolean
}

const RSSIntegration: React.FC<RSSIntegrationProps> = ({
  onFeedsChange,
  defaultExpanded = false,
}) => {
  const [feeds, setFeeds] = useState<StoredFeed[]>([])
  const [categories, setCategories] = useState<StoredCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [newFeedUrl, setNewFeedUrl] = useState('')
  const [isAddingFeed, setIsAddingFeed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rssManager, setRssManager] = useState<RSSManager | null>(null)
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  // Initialize RSS manager
  useEffect(() => {
    const initManager = async () => {
      try {
        const manager = getRSSManager()
        await manager.init()
        setRssManager(manager)

        const loadedFeeds = manager.getManagedFeeds()
        const loadedCategories = manager.getCategories()

        setFeeds(loadedFeeds)
        setCategories(loadedCategories)
        onFeedsChange?.(loadedFeeds)
      } catch (err) {
        console.error('Failed to initialize RSS manager:', err)
        setError('Failed to load RSS feeds')
      } finally {
        setIsLoading(false)
      }
    }

    initManager()
  }, [onFeedsChange])

  // Add a new feed
  const handleAddFeed = useCallback(async () => {
    if (!newFeedUrl.trim() || !rssManager) return

    setIsAddingFeed(true)
    setError(null)

    try {
      await rssManager.addFeed(newFeedUrl.trim())
      const updatedFeeds = rssManager.getManagedFeeds()
      setFeeds(updatedFeeds)
      onFeedsChange?.(updatedFeeds)
      setNewFeedUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add feed')
    } finally {
      setIsAddingFeed(false)
    }
  }, [newFeedUrl, rssManager, onFeedsChange])

  // Remove a feed
  const handleRemoveFeed = useCallback(
    async (id: string) => {
      if (!rssManager) return

      try {
        await rssManager.removeFeed(id)
        const updatedFeeds = rssManager.getManagedFeeds()
        setFeeds(updatedFeeds)
        onFeedsChange?.(updatedFeeds)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove feed')
      }
    },
    [rssManager, onFeedsChange]
  )

  // Refresh all feeds
  const handleRefreshAll = useCallback(async () => {
    if (!rssManager) return

    setIsRefreshing(true)
    setError(null)

    try {
      await rssManager.refreshAllFeeds()
      await rssManager.loadFeeds()
      setFeeds(rssManager.getManagedFeeds())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh feeds')
    } finally {
      setIsRefreshing(false)
    }
  }, [rssManager])

  // Add suggested feed
  const handleAddSuggested = useCallback(
    async (url: string) => {
      if (!rssManager) return

      setError(null)
      try {
        await rssManager.addFeed(url)
        const updatedFeeds = rssManager.getManagedFeeds()
        setFeeds(updatedFeeds)
        onFeedsChange?.(updatedFeeds)
      } catch (err) {
        if (err instanceof Error && err.message === 'Feed already exists') {
          // Silently ignore if already added
        } else {
          setError(err instanceof Error ? err.message : 'Failed to add feed')
        }
      }
    },
    [rssManager, onFeedsChange]
  )

  // Calculate totals
  const totalUnread = feeds.reduce((sum, f) => sum + f.unread_count, 0)
  const totalArticles = feeds.reduce((sum, f) => sum + f.article_count, 0)

  // Status determination
  const getStatus = () => {
    if (isLoading) return { text: 'Loading...', color: 'text-muted-foreground' }
    if (feeds.length === 0) return { text: 'Not configured', color: 'text-muted-foreground' }
    const errorFeeds = feeds.filter((f) => f.status === 'error').length
    if (errorFeeds > 0)
      return { text: `${errorFeeds} error${errorFeeds > 1 ? 's' : ''}`, color: 'text-amber-500' }
    return { text: `${feeds.length} feeds`, color: 'text-emerald-500' }
  }

  const status = getStatus()

  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${
        isExpanded
          ? 'border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-900/10 shadow-sm'
          : 'border-border hover:border-orange-300/50 dark:hover:border-orange-700/50 hover:bg-muted/30'
      }`}
    >
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        {/* Icon */}
        <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
          <Rss size={20} className="text-orange-600 dark:text-orange-400" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">RSS Feeds</span>
            {totalUnread > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 rounded">
                {totalUnread} unread
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Subscribe to news feeds, use @rss in chat
          </div>
        </div>

        {/* Status */}
        <div className={`flex items-center gap-1.5 text-xs ${status.color}`}>
          {isLoading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : feeds.length > 0 ? (
            <Check size={12} />
          ) : null}
          <span>{status.text}</span>
        </div>

        {/* Expand Indicator */}
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 space-y-4 animate-fade-in">
          {/* Divider */}
          <div className="border-t border-orange-200/50 dark:border-orange-800/30" />

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-600 dark:text-red-400 flex-1">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-red-500 hover:text-red-700"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Quick Add Feed */}
          <div className="flex gap-2">
            <input
              type="url"
              value={newFeedUrl}
              onChange={(e) => setNewFeedUrl(e.target.value)}
              placeholder="Paste RSS feed URL..."
              className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
              onKeyDown={(e) => e.key === 'Enter' && handleAddFeed()}
            />
            <button
              onClick={handleAddFeed}
              disabled={isAddingFeed || !newFeedUrl.trim()}
              className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isAddingFeed ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              Add
            </button>
          </div>

          {/* Feed List */}
          {feeds.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Your Feeds
                </span>
                <button
                  onClick={handleRefreshAll}
                  disabled={isRefreshing}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                  Refresh All
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border bg-white dark:bg-gray-800/50 p-2">
                {feeds.map((feed) => (
                  <div
                    key={feed.id}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 group transition-colors"
                  >
                    {feed.icon_url ? (
                      <img
                        src={feed.icon_url}
                        alt=""
                        className="w-5 h-5 rounded"
                        onError={(e) => {
                          ;(e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <Rss size={16} className="text-orange-500" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {feed.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{feed.url}</div>
                    </div>
                    {feed.status === 'error' && (
                      <span title={feed.error_message || 'Error'}>
                        <AlertCircle size={14} className="text-red-500" />
                      </span>
                    )}
                    {feed.unread_count > 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full">
                        {feed.unread_count}
                      </span>
                    )}
                    <button
                      onClick={() => handleRemoveFeed(feed.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Feeds - Show when less than 3 feeds */}
          {feeds.length < 3 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Popular Feeds
              </span>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(SUGGESTED_RSS_FEEDS)
                  .slice(0, 2)
                  .map(([category, suggestions]) => (
                    <div key={category} className="space-y-1.5">
                      <div className="text-[11px] font-medium text-foreground">{category}</div>
                      {suggestions.slice(0, 2).map((suggestion) => {
                        const isAdded = feeds.some((f) => f.url === suggestion.url)
                        return (
                          <button
                            key={suggestion.url}
                            onClick={() => !isAdded && handleAddSuggested(suggestion.url)}
                            disabled={isAdded}
                            className={`w-full flex items-center gap-2 p-2 text-left rounded-lg border transition-colors ${
                              isAdded
                                ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 cursor-default'
                                : 'border-border hover:border-orange-300 dark:hover:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/10'
                            }`}
                          >
                            <Rss
                              size={12}
                              className={isAdded ? 'text-emerald-500' : 'text-orange-500'}
                            />
                            <span className="text-xs truncate flex-1">{suggestion.name}</span>
                            {isAdded && <Check size={12} className="text-emerald-500" />}
                          </button>
                        )
                      })}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Usage Hint */}
          <div className="p-3 bg-orange-50 dark:bg-orange-900/10 rounded-lg border border-orange-200/50 dark:border-orange-800/30">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Usage:</strong> Type{' '}
              <code className="px-1 py-0.5 bg-orange-100 dark:bg-orange-900/30 rounded text-orange-700 dark:text-orange-300">
                @rss
              </code>{' '}
              in chat to include articles, or{' '}
              <code className="px-1 py-0.5 bg-orange-100 dark:bg-orange-900/30 rounded text-orange-700 dark:text-orange-300">
                @feed:name
              </code>{' '}
              for specific feeds.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default RSSIntegration
