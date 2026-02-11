/**
 * FlowQ Browser Relay - Background Service Worker
 *
 * Connects to FlowQ desktop app via WebSocket and relays browser commands
 * using Chrome DevTools Protocol (CDP).
 */

const FLOWQ_WS_URL = 'ws://127.0.0.1:18799';
const RECONNECT_INTERVAL = 5000;
const CDP_VERSION = '1.3';

class BrowserRelay {
  constructor() {
    this.ws = null;
    this.attachedTabs = new Map(); // tabId -> { attached: boolean, url: string }
    this.reconnectTimer = null;
    this.isConnecting = false;

    this.connect();
    this.setupEventListeners();
  }

  // ============================================
  // WebSocket Connection Management
  // ============================================

  async connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;

    try {
      this.ws = new WebSocket(FLOWQ_WS_URL);

      this.ws.onopen = () => {
        console.log('[FlowQ Relay] Connected to FlowQ');
        this.isConnecting = false;
        this.clearReconnectTimer();
        this.notifyPopup({ type: 'connection', status: 'connected' });

        // Send initial state
        this.sendToFlowQ({
          type: 'relay_ready',
          attachedTabs: Array.from(this.attachedTabs.entries())
        });
      };

      this.ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          const result = await this.handleFlowQMessage(message);

          // Send response back to FlowQ
          this.sendToFlowQ({
            type: 'response',
            requestId: message.requestId,
            result
          });
        } catch (error) {
          console.error('[FlowQ Relay] Message handling error:', error);
          this.sendToFlowQ({
            type: 'error',
            requestId: message?.requestId,
            error: error.message
          });
        }
      };

      this.ws.onclose = () => {
        console.log('[FlowQ Relay] Disconnected from FlowQ');
        this.isConnecting = false;
        this.notifyPopup({ type: 'connection', status: 'disconnected' });
        this.scheduleReconnect();
      };

      this.ws.onerror = (event) => {
        // WebSocket error events don't contain useful error info due to security
        // The actual error will trigger onclose, so we just log a generic message
        console.error('[FlowQ Relay] WebSocket connection error - is FlowQ running?');
        console.log('[FlowQ Relay] Make sure FlowQ desktop app is running and listening on', FLOWQ_WS_URL);
        this.isConnecting = false;
      };

    } catch (error) {
      console.error('[FlowQ Relay] Connection failed:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      console.log('[FlowQ Relay] Attempting reconnection...');
      this.connect();
    }, RECONNECT_INTERVAL);
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  sendToFlowQ(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  // ============================================
  // Chrome Event Listeners
  // ============================================

  setupEventListeners() {
    // Tab removed - cleanup attached debugger
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (this.attachedTabs.has(tabId)) {
        this.attachedTabs.delete(tabId);
        this.sendToFlowQ({
          type: 'tab_closed',
          tabId
        });
      }
    });

    // Tab URL changed
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (this.attachedTabs.has(tabId) && changeInfo.url) {
        this.attachedTabs.get(tabId).url = changeInfo.url;
        this.sendToFlowQ({
          type: 'tab_navigated',
          tabId,
          url: changeInfo.url
        });
      }
    });

    // Debugger detached (user closed devtools warning)
    chrome.debugger.onDetach.addListener((source, reason) => {
      const tabId = source.tabId;
      if (this.attachedTabs.has(tabId)) {
        this.attachedTabs.delete(tabId);
        this.sendToFlowQ({
          type: 'debugger_detached',
          tabId,
          reason
        });
      }
    });
  }

  // ============================================
  // Message Handler - FlowQ Commands
  // ============================================

  async handleFlowQMessage(message) {
    const { action, tabId, url, selector, text, expression, direction } = message;

    switch (action) {
      case 'ping':
        return { pong: true, timestamp: Date.now() };

      case 'list_tabs':
        return this.listTabs();

      case 'open':
        return this.openTab(url);

      case 'close':
        return this.closeTab(tabId);

      case 'attach':
        return this.attachToTab(tabId);

      case 'detach':
        return this.detachFromTab(tabId);

      case 'snapshot':
        return this.getSnapshot(tabId);

      case 'evaluate':
        return this.evaluate(tabId, expression);

      case 'click':
        return this.click(tabId, selector);

      case 'type':
        return this.type(tabId, selector, text);

      case 'scroll':
        return this.scroll(tabId, direction);

      case 'screenshot':
        return this.screenshot(tabId);

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  // ============================================
  // Tab Management
  // ============================================

  async listTabs() {
    const tabs = await chrome.tabs.query({});
    return tabs.map(tab => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      attached: this.attachedTabs.has(tab.id)
    }));
  }

  async openTab(url) {
    const tab = await chrome.tabs.create({ url, active: true });
    return {
      tabId: tab.id,
      url: tab.url,
      title: tab.title
    };
  }

  async closeTab(tabId) {
    if (this.attachedTabs.has(tabId)) {
      await this.detachFromTab(tabId);
    }
    await chrome.tabs.remove(tabId);
    return { success: true };
  }

  // ============================================
  // Debugger Control (CDP)
  // ============================================

  async attachToTab(tabId) {
    if (this.attachedTabs.has(tabId)) {
      return { success: true, alreadyAttached: true };
    }

    try {
      await chrome.debugger.attach({ tabId }, CDP_VERSION);

      const tab = await chrome.tabs.get(tabId);
      this.attachedTabs.set(tabId, {
        attached: true,
        url: tab.url
      });

      // Enable necessary CDP domains
      await chrome.debugger.sendCommand({ tabId }, 'Accessibility.enable');
      await chrome.debugger.sendCommand({ tabId }, 'DOM.enable');
      await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');

      return { success: true, tabId, url: tab.url };
    } catch (error) {
      throw new Error(`Failed to attach: ${error.message}`);
    }
  }

  async detachFromTab(tabId) {
    if (!this.attachedTabs.has(tabId)) {
      return { success: true, wasNotAttached: true };
    }

    try {
      await chrome.debugger.detach({ tabId });
      this.attachedTabs.delete(tabId);
      return { success: true };
    } catch (error) {
      this.attachedTabs.delete(tabId);
      return { success: true, error: error.message };
    }
  }

  // ============================================
  // Page Inspection
  // ============================================

  async getSnapshot(tabId) {
    this.ensureAttached(tabId);

    try {
      // Get accessibility tree
      const axTree = await chrome.debugger.sendCommand(
        { tabId },
        'Accessibility.getFullAXTree'
      );

      // Get page info and visible text content
      const pageInfo = await chrome.debugger.sendCommand(
        { tabId },
        'Runtime.evaluate',
        {
          expression: `({
            url: location.href,
            title: document.title,
            scrollY: window.scrollY,
            scrollHeight: document.body.scrollHeight,
            viewportHeight: window.innerHeight
          })`,
          returnByValue: true
        }
      );

      // Extract visible text content from the page using multiple methods
      const textContent = await chrome.debugger.sendCommand(
        { tabId },
        'Runtime.evaluate',
        {
          expression: `(() => {
            const results = [];
            const seen = new Set();

            // Helper to add unique text
            const addText = (text) => {
              const trimmed = text.trim();
              if (trimmed && trimmed.length > 1 && !seen.has(trimmed)) {
                seen.add(trimmed);
                results.push(trimmed);
              }
            };

            // Method 1: Get text from semantic elements (headings, paragraphs, articles)
            const selectors = [
              'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
              'article', 'section', 'main',
              'p', 'li', 'td', 'th',
              '[role="article"]', '[role="main"]', '[role="listitem"]',
              'a[href]', 'button', 'span', 'div'
            ];

            for (const selector of selectors) {
              try {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                  if (results.length >= 800) break;

                  // Check visibility
                  const style = window.getComputedStyle(el);
                  if (style.display === 'none' || style.visibility === 'hidden') continue;

                  // Get direct text content (not nested)
                  const text = el.innerText || el.textContent;
                  if (text) {
                    // For large blocks, split into chunks
                    if (text.length > 500) {
                      const lines = text.split('\\n').filter(l => l.trim());
                      for (const line of lines.slice(0, 20)) {
                        addText(line);
                      }
                    } else {
                      addText(text);
                    }
                  }
                }
              } catch (e) {}
            }

            // Method 2: Also get document.body.innerText as fallback (truncated)
            if (results.length < 100) {
              const bodyText = document.body.innerText || '';
              const lines = bodyText.split('\\n').filter(l => l.trim().length > 2);
              for (const line of lines.slice(0, 200)) {
                addText(line);
                if (results.length >= 800) break;
              }
            }

            return results.slice(0, 800).join('\\n');
          })()`,
          returnByValue: true
        }
      );

      // Simplify accessibility tree for AI consumption
      const simplifiedTree = this.simplifyAXTree(axTree.nodes);

      return {
        page: pageInfo.result.value,
        tree: simplifiedTree,
        nodeCount: axTree.nodes.length,
        textContent: textContent.result?.value || ''
      };
    } catch (error) {
      throw new Error(`Snapshot failed: ${error.message}`);
    }
  }

  simplifyAXTree(nodes) {
    // Convert CDP AX tree to simplified format for AI
    const simplified = [];
    const nodeMap = new Map();

    // First pass: create node map
    nodes.forEach((node, index) => {
      nodeMap.set(node.nodeId, {
        ref: `e${index}`,
        role: node.role?.value || 'unknown',
        name: node.name?.value || '',
        children: []
      });
    });

    // Second pass: build tree structure
    nodes.forEach(node => {
      const simplified = nodeMap.get(node.nodeId);
      if (node.childIds) {
        simplified.children = node.childIds
          .map(id => nodeMap.get(id))
          .filter(Boolean);
      }
    });

    // Return root nodes (nodes without parents or with document as parent)
    return nodes
      .filter(node => !node.parentId || node.role?.value === 'RootWebArea')
      .map(node => nodeMap.get(node.nodeId))
      .filter(Boolean);
  }

  // ============================================
  // Page Interaction
  // ============================================

  async evaluate(tabId, expression) {
    this.ensureAttached(tabId);

    const result = await chrome.debugger.sendCommand(
      { tabId },
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
        awaitPromise: true
      }
    );

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text);
    }

    return result.result.value;
  }

  async click(tabId, selector) {
    this.ensureAttached(tabId);

    // If selector starts with 'e', it's a ref from snapshot
    const clickScript = selector.startsWith('e')
      ? `
        // Find element by accessibility ref (simplified - real implementation needs ref mapping)
        const elements = document.querySelectorAll('*');
        const target = elements[${parseInt(selector.slice(1))}];
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.click();
          true;
        } else {
          false;
        }
      `
      : `
        const el = document.querySelector('${selector}');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.click();
          true;
        } else {
          false;
        }
      `;

    const result = await this.evaluate(tabId, clickScript);
    return { success: result, selector };
  }

  async type(tabId, selector, text) {
    this.ensureAttached(tabId);

    const typeScript = `
      const el = document.querySelector('${selector}');
      if (el) {
        el.focus();
        el.value = '${text.replace(/'/g, "\\'")}';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        true;
      } else {
        false;
      }
    `;

    const result = await this.evaluate(tabId, typeScript);
    return { success: result, selector, textLength: text.length };
  }

  async scroll(tabId, direction) {
    this.ensureAttached(tabId);

    const scrollAmount = 500;
    const scrollScript = {
      up: `window.scrollBy(0, -${scrollAmount})`,
      down: `window.scrollBy(0, ${scrollAmount})`,
      left: `window.scrollBy(-${scrollAmount}, 0)`,
      right: `window.scrollBy(${scrollAmount}, 0)`
    }[direction];

    if (!scrollScript) {
      throw new Error(`Invalid scroll direction: ${direction}`);
    }

    await this.evaluate(tabId, scrollScript);
    return { success: true, direction };
  }

  async screenshot(tabId) {
    this.ensureAttached(tabId);

    const result = await chrome.debugger.sendCommand(
      { tabId },
      'Page.captureScreenshot',
      { format: 'png' }
    );

    return {
      data: result.data, // base64 encoded
      format: 'png'
    };
  }

  // ============================================
  // Helpers
  // ============================================

  ensureAttached(tabId) {
    if (!this.attachedTabs.has(tabId)) {
      throw new Error(`Tab ${tabId} is not attached. Call 'attach' first.`);
    }
  }

  notifyPopup(message) {
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup might not be open, ignore error
    });
  }

  // Get connection status for popup
  getStatus() {
    return {
      connected: this.ws && this.ws.readyState === WebSocket.OPEN,
      attachedTabs: Array.from(this.attachedTabs.entries()).map(([id, info]) => ({
        tabId: id,
        ...info
      }))
    };
  }
}

// ============================================
// Initialize
// ============================================

const relay = new BrowserRelay();

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get_status') {
    sendResponse(relay.getStatus());
    return true;
  }

  if (message.type === 'reconnect') {
    relay.connect();
    sendResponse({ ok: true });
    return true;
  }
});

console.log('[FlowQ Relay] Service worker initialized');
