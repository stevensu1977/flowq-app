/**
 * RSS Feed Manager
 *
 * Handles RSS feed operations: add, remove, refresh, search
 * All data is stored locally via Tauri backend
 */

// Use native crypto.randomUUID() instead of uuid package
const generateId = () => crypto.randomUUID()

import {
  rssFetchAndParse,
  rssGetFeeds,
  rssCreateFeed,
  rssUpdateFeed,
  rssDeleteFeed,
  rssGetCategories,
  rssCreateCategory,
  rssDeleteCategory,
  rssUpsertArticles,
  rssGetArticles,
  rssGetRecentArticles,
  rssSearchArticles,
  rssMarkArticleRead,
  rssToggleArticleStarred,
  rssGetStarredArticles,
  rssCleanupOldArticles,
  rssFetch,
  type StoredFeed,
  type StoredCategory,
  type StoredArticle,
  type RSSParsedFeed,
  type RSSParsedItem,
} from '../tauri-api'

export interface RSSManagerOptions {
  refreshInterval?: number  // minutes, default 30
  retentionDays?: number    // days to keep articles, default 30
  maxArticlesPerFeed?: number  // default 100
}

export class RSSManager {
  private options: Required<RSSManagerOptions>
  private refreshTimer: ReturnType<typeof setInterval> | null = null
  private feeds: Map<string, StoredFeed> = new Map()
  private categories: Map<string, StoredCategory> = new Map()

  constructor(options: RSSManagerOptions = {}) {
    this.options = {
      refreshInterval: options.refreshInterval ?? 30,
      retentionDays: options.retentionDays ?? 30,
      maxArticlesPerFeed: options.maxArticlesPerFeed ?? 100,
    }
  }

  /**
   * Initialize manager and load feeds from database
   */
  async init(): Promise<void> {
    await this.loadFeeds()
    await this.loadCategories()
  }

  /**
   * Start automatic feed refresh
   */
  startAutoRefresh(): void {
    if (this.refreshTimer) return

    const intervalMs = this.options.refreshInterval * 60 * 1000
    this.refreshTimer = setInterval(() => {
      this.refreshAllFeeds().catch(console.error)
    }, intervalMs)

    // Also cleanup old articles periodically
    setInterval(() => {
      this.cleanupOldArticles().catch(console.error)
    }, 24 * 60 * 60 * 1000) // Daily
  }

  /**
   * Stop automatic feed refresh
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  // ============ Feed Operations ============

  /**
   * Load all feeds from database
   */
  async loadFeeds(): Promise<StoredFeed[]> {
    const feeds = await rssGetFeeds()
    this.feeds.clear()
    for (const feed of feeds) {
      this.feeds.set(feed.id, feed)
    }
    return feeds
  }

  /**
   * Get all managed feeds
   */
  getManagedFeeds(): StoredFeed[] {
    return Array.from(this.feeds.values())
  }

  /**
   * Get feed by ID
   */
  getFeed(id: string): StoredFeed | undefined {
    return this.feeds.get(id)
  }

  /**
   * Add a new RSS feed
   */
  async addFeed(url: string, options?: {
    categoryId?: string
    tags?: string[]
  }): Promise<StoredFeed> {
    // Validate URL
    try {
      new URL(url)
    } catch {
      throw new Error('Invalid URL format')
    }

    // Check if feed already exists
    for (const feed of this.feeds.values()) {
      if (feed.url === url) {
        throw new Error('Feed already exists')
      }
    }

    // Fetch and parse feed to get info
    const parsed = await rssFetchAndParse(url)

    const now = new Date().toISOString()
    const feed: StoredFeed = {
      id: generateId(),
      url,
      title: parsed.title,
      description: parsed.description,
      site_url: parsed.link,
      icon_url: parsed.icon || this.getFaviconUrl(url),
      category_id: options?.categoryId || null,
      tags: options?.tags || [],
      status: 'active',
      error_message: null,
      last_fetched_at: now,
      etag: null,
      last_modified: null,
      article_count: 0,
      unread_count: 0,
      created_at: now,
      updated_at: now,
    }

    // Save feed
    await rssCreateFeed(feed)
    this.feeds.set(feed.id, feed)

    // Fetch initial articles
    await this.refreshFeed(feed.id)

    return feed
  }

  /**
   * Remove a feed
   */
  async removeFeed(id: string): Promise<void> {
    await rssDeleteFeed(id)
    this.feeds.delete(id)
  }

  /**
   * Update feed settings
   */
  async updateFeed(id: string, updates: Partial<StoredFeed>): Promise<StoredFeed> {
    const feed = this.feeds.get(id)
    if (!feed) {
      throw new Error('Feed not found')
    }

    const updated: StoredFeed = {
      ...feed,
      ...updates,
      updated_at: new Date().toISOString(),
    }

    await rssUpdateFeed(updated)
    this.feeds.set(id, updated)

    return updated
  }

  /**
   * Refresh a single feed
   */
  async refreshFeed(id: string): Promise<number> {
    const feed = this.feeds.get(id)
    if (!feed) {
      throw new Error('Feed not found')
    }

    try {
      // Fetch with conditional headers
      const result = await rssFetch(feed.url, feed.etag || undefined, feed.last_modified || undefined)

      // Handle 304 Not Modified
      if (result.status_code === 304) {
        return 0
      }

      // Parse content
      const parsed = await this.parseContent(result.content)

      // Convert to articles
      const now = new Date().toISOString()
      const articles: StoredArticle[] = parsed.items
        .slice(0, this.options.maxArticlesPerFeed)
        .map(item => this.parsedItemToArticle(item, feed.id, now))

      // Save articles
      const newCount = await rssUpsertArticles(articles)

      // Update feed metadata
      const updated = await this.updateFeed(id, {
        status: 'active',
        error_message: null,
        last_fetched_at: now,
        etag: result.etag,
        last_modified: result.last_modified,
        article_count: feed.article_count + newCount,
        unread_count: feed.unread_count + newCount,
      })

      return newCount
    } catch (error) {
      // Update feed with error
      await this.updateFeed(id, {
        status: 'error',
        error_message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Refresh all active feeds
   */
  async refreshAllFeeds(): Promise<Map<string, number | Error>> {
    const results = new Map<string, number | Error>()

    const activeFeeds = Array.from(this.feeds.values())
      .filter(f => f.status !== 'paused')

    await Promise.allSettled(
      activeFeeds.map(async feed => {
        try {
          const count = await this.refreshFeed(feed.id)
          results.set(feed.id, count)
        } catch (error) {
          results.set(feed.id, error instanceof Error ? error : new Error(String(error)))
        }
      })
    )

    return results
  }

  // ============ Category Operations ============

  /**
   * Load all categories from database
   */
  async loadCategories(): Promise<StoredCategory[]> {
    const categories = await rssGetCategories()
    this.categories.clear()
    for (const category of categories) {
      this.categories.set(category.id, category)
    }
    return categories
  }

  /**
   * Get all categories
   */
  getCategories(): StoredCategory[] {
    return Array.from(this.categories.values())
  }

  /**
   * Create a new category
   */
  async createCategory(name: string, color?: string): Promise<StoredCategory> {
    const category: StoredCategory = {
      id: generateId(),
      name,
      color: color || null,
      feed_count: 0,
      created_at: new Date().toISOString(),
    }

    await rssCreateCategory(category)
    this.categories.set(category.id, category)

    return category
  }

  /**
   * Delete a category
   */
  async deleteCategory(id: string): Promise<void> {
    await rssDeleteCategory(id)
    this.categories.delete(id)
  }

  // ============ Article Operations ============

  /**
   * Get articles for a feed
   */
  async getArticles(feedId: string, limit?: number): Promise<StoredArticle[]> {
    return rssGetArticles(feedId, limit || this.options.maxArticlesPerFeed)
  }

  /**
   * Get recent articles across all feeds
   */
  async getRecentArticles(options?: {
    hours?: number
    limit?: number
    feedIds?: string[]
  }): Promise<StoredArticle[]> {
    const hours = options?.hours || 24
    const limit = options?.limit || 50

    let articles = await rssGetRecentArticles(hours, limit)

    // Filter by feedIds if specified
    if (options?.feedIds && options.feedIds.length > 0) {
      const feedIdSet = new Set(options.feedIds)
      articles = articles.filter(a => feedIdSet.has(a.feed_id))
    }

    return articles
  }

  /**
   * Search articles
   */
  async searchArticles(query: string, limit?: number): Promise<StoredArticle[]> {
    return rssSearchArticles(query, limit || 50)
  }

  /**
   * Mark article as read
   */
  async markAsRead(id: string): Promise<void> {
    await rssMarkArticleRead(id, true)
  }

  /**
   * Mark article as unread
   */
  async markAsUnread(id: string): Promise<void> {
    await rssMarkArticleRead(id, false)
  }

  /**
   * Toggle article starred status
   */
  async toggleStarred(id: string): Promise<boolean> {
    return rssToggleArticleStarred(id)
  }

  /**
   * Get starred articles
   */
  async getStarredArticles(limit?: number): Promise<StoredArticle[]> {
    return rssGetStarredArticles(limit || 100)
  }

  /**
   * Cleanup old articles
   */
  async cleanupOldArticles(): Promise<number> {
    return rssCleanupOldArticles(this.options.retentionDays)
  }

  // ============ Helpers ============

  private getFaviconUrl(feedUrl: string): string {
    try {
      const url = new URL(feedUrl)
      return `${url.origin}/favicon.ico`
    } catch {
      return ''
    }
  }

  private async parseContent(content: string): Promise<RSSParsedFeed> {
    // Use the backend parser
    const { rssParse } = await import('../tauri-api')
    return rssParse(content)
  }

  private parsedItemToArticle(item: RSSParsedItem, feedId: string, fetchedAt: string): StoredArticle {
    // Generate unique ID from guid or link
    const id = item.guid || item.link || generateId()

    // Parse publish date
    let publishedAt = fetchedAt
    if (item.pub_date) {
      try {
        publishedAt = new Date(item.pub_date).toISOString()
      } catch {
        publishedAt = fetchedAt
      }
    }

    return {
      id,
      feed_id: feedId,
      title: item.title || 'Untitled',
      link: item.link || '',
      content: item.content || item.description || '',
      summary: null,
      author: item.author || null,
      image_url: this.extractImageUrl(item),
      enclosures: item.enclosures.length > 0 ? JSON.stringify(item.enclosures) : null,
      published_at: publishedAt,
      fetched_at: fetchedAt,
      is_read: false,
      is_starred: false,
      topics: null,
    }
  }

  private extractImageUrl(item: RSSParsedItem): string | null {
    // Try to find image in content
    const content = item.content || item.description || ''
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/)
    if (imgMatch) {
      return imgMatch[1]
    }

    // Check enclosures for images
    for (const enclosure of item.enclosures) {
      if (enclosure.media_type.startsWith('image/')) {
        return enclosure.url
      }
    }

    return null
  }
}

// Singleton instance
let rssManagerInstance: RSSManager | null = null

/**
 * Get or create the RSS manager instance
 */
export function getRSSManager(options?: RSSManagerOptions): RSSManager {
  if (!rssManagerInstance) {
    rssManagerInstance = new RSSManager(options)
  }
  return rssManagerInstance
}

/**
 * Reset the RSS manager instance (for testing)
 */
export function resetRSSManager(): void {
  if (rssManagerInstance) {
    rssManagerInstance.stopAutoRefresh()
    rssManagerInstance = null
  }
}
