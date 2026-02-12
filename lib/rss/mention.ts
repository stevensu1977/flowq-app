/**
 * @rss Mention Processor
 *
 * Processes @rss mentions in chat messages and injects article context
 * Works like @# for browser tabs - pulls from all managed feeds
 */

import { getRSSManager } from './manager'
import type { StoredFeed, StoredArticle } from '../tauri-api'

export interface RSSMentionContext {
  articles: StoredArticle[]
  feedCount: number
  unreadCount: number
  timeRange: { start: Date; end: Date }
  categoryFilter?: string
  feedFilter?: string
}

export interface ProcessRSSMentionResult {
  enrichedMessage: string
  context: RSSMentionContext | null
  hasMention: boolean
}

/**
 * Check if message contains @rss mention
 */
export function hasRSSMention(message: string): boolean {
  return /@(rss|news|feed:)/i.test(message)
}

/**
 * Process @rss mentions and inject article context
 * Only pulls from feeds added in Integrations settings
 */
export async function processRSSMention(message: string): Promise<ProcessRSSMentionResult> {
  // Match mention patterns
  const mentionPatterns = [
    /@rss(?::(\w+))?/gi,      // @rss or @rss:category
    /@feed:([^\s]+)/gi,       // @feed:feedname
    /@news/gi,                // @news alias
  ]

  let hasRSSMentionFlag = false
  let categoryFilter: string | null = null
  let feedFilter: string | null = null

  // Check for mentions and extract filters
  for (const pattern of mentionPatterns) {
    const matches = [...message.matchAll(pattern)]
    if (matches.length > 0) {
      hasRSSMentionFlag = true
      for (const match of matches) {
        if (match[0].toLowerCase().startsWith('@rss:')) {
          categoryFilter = match[1]?.toLowerCase() || null
        } else if (match[0].toLowerCase().startsWith('@feed:')) {
          feedFilter = match[1]?.toLowerCase() || null
        }
      }
    }
  }

  if (!hasRSSMentionFlag) {
    return {
      enrichedMessage: message,
      context: null,
      hasMention: false,
    }
  }

  // Get RSS manager
  const rssManager = getRSSManager()
  await rssManager.init()

  // Get managed feeds
  const managedFeeds = rssManager.getManagedFeeds()

  if (managedFeeds.length === 0) {
    return {
      enrichedMessage: message + '\n\n> 没有配置 RSS 订阅源。请在 设置 > 集成 > RSS 中添加订阅源。',
      context: null,
      hasMention: true,
    }
  }

  // Apply filters to determine which feeds to query
  let feedIds: string[] | undefined
  const categories = rssManager.getCategories()

  if (feedFilter) {
    // Find feed by name or ID (case-insensitive comparison for both)
    const feed = managedFeeds.find(f =>
      f.title.toLowerCase().includes(feedFilter!) ||
      f.id.toLowerCase() === feedFilter!.toLowerCase()
    )
    if (feed) {
      feedIds = [feed.id]
    } else {
      return {
        enrichedMessage: message + `\n\n> 未找到名为 "${feedFilter}" 的订阅源。`,
        context: null,
        hasMention: true,
      }
    }
  } else if (categoryFilter) {
    // Find category
    const category = categories.find(c =>
      c.name.toLowerCase().includes(categoryFilter!) ||
      c.id === categoryFilter
    )
    if (category) {
      const categoryFeeds = managedFeeds.filter(f => f.category_id === category.id)
      feedIds = categoryFeeds.map(f => f.id)
    } else {
      return {
        enrichedMessage: message + `\n\n> 未找到名为 "${categoryFilter}" 的分类。`,
        context: null,
        hasMention: true,
      }
    }
  }

  // Fetch recent articles
  const timeRange = {
    start: new Date(Date.now() - 24 * 60 * 60 * 1000),
    end: new Date(),
  }

  const articles = await rssManager.getRecentArticles({
    hours: 24,
    limit: 30,
    feedIds,
  })

  if (articles.length === 0) {
    return {
      enrichedMessage: message + '\n\n> 过去 24 小时内没有新文章。',
      context: null,
      hasMention: true,
    }
  }

  // Format articles for context injection
  const formattedArticles = articles.map(article => {
    const feed = managedFeeds.find(f => f.id === article.feed_id)
    const publishedTime = formatRelativeTime(new Date(article.published_at))

    // Truncate content for context
    const contentPreview = truncateContent(article.content, 500)

    return `### ${article.title}
**来源:** ${feed?.title || '未知'} · ${publishedTime}
**链接:** ${article.link}

${contentPreview}
`
  }).join('\n---\n')

  // Build context header
  const contextHeader = `
---
## RSS 订阅源上下文

**订阅源:** ${managedFeeds.length} 个已配置 · **文章:** ${articles.length} 篇来自过去 24 小时
${categoryFilter ? `**分类:** ${categoryFilter}` : ''}
${feedFilter ? `**订阅源:** ${feedFilter}` : ''}

${formattedArticles}
---
`

  return {
    enrichedMessage: message + contextHeader,
    context: {
      articles,
      feedCount: managedFeeds.length,
      unreadCount: articles.filter(a => !a.is_read).length,
      timeRange,
      categoryFilter: categoryFilter || undefined,
      feedFilter: feedFilter || undefined,
    },
    hasMention: true,
  }
}

/**
 * Get mention autocomplete suggestions
 */
export async function getRSSMentionSuggestions(): Promise<Array<{
  label: string
  description: string
  icon: string
}>> {
  const rssManager = getRSSManager()
  await rssManager.init()

  const feeds = rssManager.getManagedFeeds()
  const categories = rssManager.getCategories()

  const suggestions: Array<{ label: string; description: string; icon: string }> = [
    { label: '@rss', description: '所有 RSS 订阅源', icon: '📡' },
    { label: '@news', description: '@rss 的别名', icon: '📰' },
  ]

  // Add category suggestions
  for (const category of categories) {
    suggestions.push({
      label: `@rss:${category.name.toLowerCase()}`,
      description: `${category.feed_count} 个订阅源在 ${category.name}`,
      icon: '📁',
    })
  }

  // Add feed suggestions (top 5)
  for (const feed of feeds.slice(0, 5)) {
    suggestions.push({
      label: `@feed:${feed.id}`,
      description: feed.title,
      icon: feed.icon_url || '🔗',
    })
  }

  return suggestions
}

// ============ Helpers ============

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins} 分钟前`
  if (diffHours < 24) return `${diffHours} 小时前`
  if (diffDays < 7) return `${diffDays} 天前`

  return date.toLocaleDateString('zh-CN')
}

function truncateContent(content: string, maxLength: number): string {
  // Remove HTML tags
  const textContent = content.replace(/<[^>]*>/g, '')

  if (textContent.length <= maxLength) {
    return textContent
  }

  return textContent.slice(0, maxLength) + '...'
}
