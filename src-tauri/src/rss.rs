//! RSS feed fetching and management for FlowQ

use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Result from fetching an RSS feed
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchResult {
    pub content: String,
    pub content_type: String,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub status_code: u16,
}

/// Parsed RSS feed information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedFeed {
    pub title: String,
    pub description: Option<String>,
    pub link: Option<String>,
    pub icon: Option<String>,
    pub items: Vec<ParsedItem>,
}

/// Parsed RSS item/article
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedItem {
    pub guid: Option<String>,
    pub title: Option<String>,
    pub link: Option<String>,
    pub description: Option<String>,
    pub content: Option<String>,
    pub author: Option<String>,
    pub pub_date: Option<String>,
    pub enclosures: Vec<ParsedEnclosure>,
}

/// Parsed enclosure (for podcasts, videos)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedEnclosure {
    pub url: String,
    pub media_type: String,
    pub length: Option<u64>,
}

/// RSS feed manager for fetching and parsing feeds
pub struct RSSFetcher {
    client: Client,
}

impl RSSFetcher {
    pub fn new() -> Self {
        let client = Client::builder()
            .user_agent("FlowQ/1.0 RSS Reader")
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap();

        Self { client }
    }

    /// Fetch RSS feed content with conditional headers for caching
    pub async fn fetch(
        &self,
        url: &str,
        etag: Option<&str>,
        last_modified: Option<&str>,
    ) -> Result<FetchResult, String> {
        let mut request = self.client.get(url);

        // Add conditional headers for caching
        if let Some(etag) = etag {
            request = request.header("If-None-Match", etag);
        }
        if let Some(lm) = last_modified {
            request = request.header("If-Modified-Since", lm);
        }

        let response = request.send().await.map_err(|e| e.to_string())?;
        let status_code = response.status().as_u16();

        // Handle 304 Not Modified
        if status_code == 304 {
            return Ok(FetchResult {
                content: String::new(),
                content_type: String::new(),
                etag: None,
                last_modified: None,
                status_code,
            });
        }

        if !response.status().is_success() {
            return Err(format!(
                "HTTP {}: {}",
                response.status(),
                response.status().as_str()
            ));
        }

        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/xml")
            .to_string();

        let etag = response
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let last_modified = response
            .headers()
            .get("last-modified")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let content = response.text().await.map_err(|e| e.to_string())?;

        Ok(FetchResult {
            content,
            content_type,
            etag,
            last_modified,
            status_code,
        })
    }

    /// Parse RSS or Atom feed from XML content
    pub fn parse(&self, content: &str) -> Result<ParsedFeed, String> {
        // Try RSS 2.0 first, then Atom
        if content.contains("<rss") || content.contains("<channel>") {
            self.parse_rss(content)
        } else if content.contains("<feed") && content.contains("xmlns=\"http://www.w3.org/2005/Atom\"") {
            self.parse_atom(content)
        } else if content.contains("<feed") {
            // Atom without namespace
            self.parse_atom(content)
        } else {
            Err("Unknown feed format".to_string())
        }
    }

    /// Parse RSS 2.0 format
    fn parse_rss(&self, content: &str) -> Result<ParsedFeed, String> {
        // Simple XML parsing without external crate
        // Extract channel info
        let title = extract_tag_content(content, "title")
            .unwrap_or_else(|| "Untitled Feed".to_string());
        let description = extract_tag_content(content, "description");
        let link = extract_tag_content(content, "link");

        // Try to get image/icon
        let icon = extract_nested_tag_content(content, "image", "url")
            .or_else(|| {
                // Fallback: try to get favicon from link
                link.as_ref().and_then(|l| {
                    Url::parse(l).ok().map(|u: Url| {
                        format!("{}://{}/favicon.ico", u.scheme(), u.host_str().unwrap_or(""))
                    })
                })
            });

        // Extract items
        let items = extract_items(content, "item")
            .into_iter()
            .map(|item_xml| {
                ParsedItem {
                    guid: extract_tag_content(&item_xml, "guid"),
                    title: extract_tag_content(&item_xml, "title"),
                    link: extract_tag_content(&item_xml, "link"),
                    description: extract_tag_content(&item_xml, "description"),
                    content: extract_tag_content(&item_xml, "content:encoded")
                        .or_else(|| extract_tag_content(&item_xml, "content")),
                    author: extract_tag_content(&item_xml, "author")
                        .or_else(|| extract_tag_content(&item_xml, "dc:creator")),
                    pub_date: extract_tag_content(&item_xml, "pubDate"),
                    enclosures: extract_enclosures(&item_xml),
                }
            })
            .collect();

        Ok(ParsedFeed {
            title,
            description,
            link,
            icon,
            items,
        })
    }

    /// Parse Atom format
    fn parse_atom(&self, content: &str) -> Result<ParsedFeed, String> {
        let title = extract_tag_content(content, "title")
            .unwrap_or_else(|| "Untitled Feed".to_string());
        let description = extract_tag_content(content, "subtitle");
        let link = extract_atom_link(content, "alternate")
            .or_else(|| extract_atom_link(content, ""));
        let icon = extract_tag_content(content, "icon")
            .or_else(|| extract_tag_content(content, "logo"));

        // Extract entries
        let items = extract_items(content, "entry")
            .into_iter()
            .map(|entry_xml| {
                ParsedItem {
                    guid: extract_tag_content(&entry_xml, "id"),
                    title: extract_tag_content(&entry_xml, "title"),
                    link: extract_atom_link(&entry_xml, "alternate")
                        .or_else(|| extract_atom_link(&entry_xml, "")),
                    description: extract_tag_content(&entry_xml, "summary"),
                    content: extract_tag_content(&entry_xml, "content"),
                    author: extract_nested_tag_content(&entry_xml, "author", "name"),
                    pub_date: extract_tag_content(&entry_xml, "published")
                        .or_else(|| extract_tag_content(&entry_xml, "updated")),
                    enclosures: extract_atom_enclosures(&entry_xml),
                }
            })
            .collect();

        Ok(ParsedFeed {
            title,
            description,
            link,
            icon,
            items,
        })
    }
}

impl Default for RSSFetcher {
    fn default() -> Self {
        Self::new()
    }
}

// ============ XML Parsing Helpers ============

fn extract_tag_content(xml: &str, tag: &str) -> Option<String> {
    // Handle both <tag>content</tag> and <tag><![CDATA[content]]></tag>
    let open_tag = format!("<{}", tag);
    let close_tag = format!("</{}>", tag);

    let start_idx = xml.find(&open_tag)?;
    let tag_end = xml[start_idx..].find('>')?;
    let content_start = start_idx + tag_end + 1;

    let end_idx = xml[content_start..].find(&close_tag)?;
    let content = &xml[content_start..content_start + end_idx];

    // Handle CDATA
    let content = if content.trim().starts_with("<![CDATA[") && content.trim().ends_with("]]>") {
        let trimmed = content.trim();
        &trimmed[9..trimmed.len() - 3]
    } else {
        content
    };

    let decoded = decode_xml_entities(content.trim());
    if decoded.is_empty() {
        None
    } else {
        Some(decoded)
    }
}

fn extract_nested_tag_content(xml: &str, parent_tag: &str, child_tag: &str) -> Option<String> {
    let open_tag = format!("<{}", parent_tag);
    let close_tag = format!("</{}>", parent_tag);

    let start_idx = xml.find(&open_tag)?;
    let end_idx = xml[start_idx..].find(&close_tag)?;
    let parent_content = &xml[start_idx..start_idx + end_idx + close_tag.len()];

    extract_tag_content(parent_content, child_tag)
}

fn extract_items(xml: &str, tag: &str) -> Vec<String> {
    let open_tag = format!("<{}", tag);
    let close_tag = format!("</{}>", tag);
    let mut items = Vec::new();
    let mut search_start = 0;

    while let Some(start_idx) = xml[search_start..].find(&open_tag) {
        let abs_start = search_start + start_idx;
        if let Some(end_offset) = xml[abs_start..].find(&close_tag) {
            let end_idx = abs_start + end_offset + close_tag.len();
            items.push(xml[abs_start..end_idx].to_string());
            search_start = end_idx;
        } else {
            break;
        }
    }

    items
}

fn extract_atom_link(xml: &str, rel: &str) -> Option<String> {
    // Find <link> tags with href attribute
    let mut search_start = 0;

    while let Some(start_idx) = xml[search_start..].find("<link") {
        let abs_start = search_start + start_idx;
        let tag_end = xml[abs_start..].find('>')?;
        let link_tag = &xml[abs_start..abs_start + tag_end + 1];

        // Check rel attribute if specified
        let rel_matches = if rel.is_empty() {
            !link_tag.contains("rel=")
        } else {
            link_tag.contains(&format!("rel=\"{}\"", rel)) ||
            link_tag.contains(&format!("rel='{}'", rel))
        };

        if rel_matches {
            // Extract href
            if let Some(href_start) = link_tag.find("href=\"") {
                let href_content_start = href_start + 6;
                if let Some(href_end) = link_tag[href_content_start..].find('"') {
                    return Some(link_tag[href_content_start..href_content_start + href_end].to_string());
                }
            } else if let Some(href_start) = link_tag.find("href='") {
                let href_content_start = href_start + 6;
                if let Some(href_end) = link_tag[href_content_start..].find('\'') {
                    return Some(link_tag[href_content_start..href_content_start + href_end].to_string());
                }
            }
        }

        search_start = abs_start + tag_end + 1;
    }

    None
}

fn extract_enclosures(item_xml: &str) -> Vec<ParsedEnclosure> {
    let mut enclosures = Vec::new();
    let mut search_start = 0;

    while let Some(start_idx) = item_xml[search_start..].find("<enclosure") {
        let abs_start = search_start + start_idx;
        if let Some(tag_end) = item_xml[abs_start..].find('>') {
            let enclosure_tag = &item_xml[abs_start..abs_start + tag_end + 1];

            if let Some(url) = extract_attr(enclosure_tag, "url") {
                let media_type = extract_attr(enclosure_tag, "type").unwrap_or_default();
                let length = extract_attr(enclosure_tag, "length")
                    .and_then(|l| l.parse().ok());

                enclosures.push(ParsedEnclosure {
                    url,
                    media_type,
                    length,
                });
            }

            search_start = abs_start + tag_end + 1;
        } else {
            break;
        }
    }

    enclosures
}

fn extract_atom_enclosures(entry_xml: &str) -> Vec<ParsedEnclosure> {
    // In Atom, enclosures are <link rel="enclosure" ...>
    let mut enclosures = Vec::new();
    let mut search_start = 0;

    while let Some(start_idx) = entry_xml[search_start..].find("<link") {
        let abs_start = search_start + start_idx;
        if let Some(tag_end) = entry_xml[abs_start..].find('>') {
            let link_tag = &entry_xml[abs_start..abs_start + tag_end + 1];

            if link_tag.contains("rel=\"enclosure\"") || link_tag.contains("rel='enclosure'") {
                if let Some(url) = extract_attr(link_tag, "href") {
                    let media_type = extract_attr(link_tag, "type").unwrap_or_default();
                    let length = extract_attr(link_tag, "length")
                        .and_then(|l| l.parse().ok());

                    enclosures.push(ParsedEnclosure {
                        url,
                        media_type,
                        length,
                    });
                }
            }

            search_start = abs_start + tag_end + 1;
        } else {
            break;
        }
    }

    enclosures
}

fn extract_attr(tag: &str, attr: &str) -> Option<String> {
    let patterns = [
        format!("{}=\"", attr),
        format!("{}='", attr),
    ];

    for pattern in patterns {
        if let Some(start) = tag.find(&pattern) {
            let value_start = start + pattern.len();
            let quote = if pattern.ends_with('"') { '"' } else { '\'' };
            if let Some(end) = tag[value_start..].find(quote) {
                return Some(tag[value_start..value_start + end].to_string());
            }
        }
    }

    None
}

fn decode_xml_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
}

// ============ Tauri Commands ============

/// Fetch an RSS feed and return raw content with cache headers
#[tauri::command]
pub async fn rss_fetch(
    url: String,
    etag: Option<String>,
    last_modified: Option<String>,
) -> Result<FetchResult, String> {
    let fetcher = RSSFetcher::new();
    fetcher.fetch(&url, etag.as_deref(), last_modified.as_deref()).await
}

/// Fetch and parse an RSS feed
#[tauri::command]
pub async fn rss_fetch_and_parse(url: String) -> Result<ParsedFeed, String> {
    let fetcher = RSSFetcher::new();
    let result = fetcher.fetch(&url, None, None).await?;

    if result.status_code == 304 {
        return Err("Not Modified".to_string());
    }

    fetcher.parse(&result.content)
}

/// Parse RSS content (useful when content is already fetched)
#[tauri::command]
pub fn rss_parse(content: String) -> Result<ParsedFeed, String> {
    let fetcher = RSSFetcher::new();
    fetcher.parse(&content)
}
