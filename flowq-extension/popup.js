/**
 * FlowQ Browser Relay - Popup UI Logic
 */

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const btnReconnect = document.getElementById('btnReconnect');
const tabsList = document.getElementById('tabsList');

// Update connection status UI
function updateConnectionStatus(connected) {
  if (connected) {
    statusDot.className = 'status-dot connected';
    statusText.className = 'status-text connected';
    statusText.textContent = 'Connected to FlowQ';
    btnReconnect.style.display = 'none';
  } else {
    statusDot.className = 'status-dot';
    statusText.className = 'status-text disconnected';
    statusText.textContent = 'Disconnected - Start FlowQ app';
    btnReconnect.style.display = 'block';
  }
}

// Update attached tabs list
function updateTabsList(attachedTabs) {
  if (!attachedTabs || attachedTabs.length === 0) {
    tabsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔌</div>
        <p>No tabs attached yet.<br>FlowQ will request access when needed.</p>
      </div>
    `;
    return;
  }

  tabsList.innerHTML = attachedTabs.map(tab => {
    const favicon = getFaviconEmoji(tab.url);
    const domain = getDomain(tab.url);

    return `
      <div class="tab-item attached" data-tab-id="${tab.tabId}">
        <div class="tab-favicon">${favicon}</div>
        <div class="tab-info">
          <div class="tab-title">${escapeHtml(tab.title || 'Untitled')}</div>
          <div class="tab-url">${escapeHtml(domain)}</div>
        </div>
        <span class="tab-badge">Active</span>
      </div>
    `;
  }).join('');

  // Add click handlers to detach tabs
  tabsList.querySelectorAll('.tab-item').forEach(item => {
    item.addEventListener('click', () => {
      const tabId = parseInt(item.dataset.tabId);
      // Could add detach functionality here
      chrome.tabs.update(tabId, { active: true });
    });
  });
}

// Get emoji favicon based on URL
function getFaviconEmoji(url) {
  if (!url) return '🌐';

  const domain = getDomain(url).toLowerCase();

  const emojiMap = {
    'github.com': '🐙',
    'x.com': '𝕏',
    'twitter.com': '𝕏',
    'notion.so': '📝',
    'google.com': '🔍',
    'youtube.com': '▶️',
    'medium.com': '📰',
    'stackoverflow.com': '📚',
    'reddit.com': '🤖',
    'linkedin.com': '💼',
    'slack.com': '💬',
    'discord.com': '🎮',
    'figma.com': '🎨',
    'dribbble.com': '🏀',
    'localhost': '🖥️',
  };

  for (const [site, emoji] of Object.entries(emojiMap)) {
    if (domain.includes(site)) return emoji;
  }

  return '🌐';
}

// Extract domain from URL
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url || '';
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Request status from background script
function refreshStatus() {
  chrome.runtime.sendMessage({ type: 'get_status' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error getting status:', chrome.runtime.lastError);
      updateConnectionStatus(false);
      updateTabsList([]);
      return;
    }

    if (response) {
      updateConnectionStatus(response.connected);
      updateTabsList(response.attachedTabs);
    }
  });
}

// Listen for status updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'connection') {
    updateConnectionStatus(message.status === 'connected');
    refreshStatus(); // Also refresh tabs list
  }
});

// Reconnect button
btnReconnect.addEventListener('click', () => {
  statusDot.className = 'status-dot connecting';
  statusText.textContent = 'Connecting...';

  chrome.runtime.sendMessage({ type: 'reconnect' }, () => {
    setTimeout(refreshStatus, 1000);
  });
});

// Initial status check
refreshStatus();

// Refresh periodically while popup is open
setInterval(refreshStatus, 3000);
