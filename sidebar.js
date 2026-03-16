
/**
 * ChatClaw Sidebar Logic
 * Handles WebSocket connection, chat UI, and settings.
 */

const DEFAULT_GATEWAY = 'ws://127.0.0.1:10961/ws';
const PROTOCOL_VERSION = 3;
// WebSocket Protocol Endpoints/Message Types
const WS_TYPES = {
  CHAT: 'message',
  PING: 'ping',
  PONG: 'pong'
};

const isExtensionEnv = typeof chrome !== 'undefined' && !!chrome?.storage?.local;

const storage = {
  async get(keys) {
    if (isExtensionEnv) return chrome.storage.local.get(keys);
    const raw = localStorage.getItem('mc_storage') || '{}';
    const data = JSON.parse(raw);
    if (Array.isArray(keys)) {
      return keys.reduce((acc, k) => {
        acc[k] = data[k];
        return acc;
      }, {});
    }
    return data;
  },
  async set(values) {
    if (isExtensionEnv) return chrome.storage.local.set(values);
    const raw = localStorage.getItem('mc_storage') || '{}';
    const data = JSON.parse(raw);
    localStorage.setItem('mc_storage', JSON.stringify({ ...data, ...values }));
  }
};

const tabsApi = {
  async query(queryInfo) {
    if (isExtensionEnv) return chrome.tabs.query(queryInfo);
    return [{ id: 1, url: location.href, title: document.title }];
  },
  async sendMessage(tabId, message) {
    if (isExtensionEnv) return chrome.tabs.sendMessage(tabId, message);
    if (message?.type === 'collect-basic-context') {
      return { context: { url: location.href, title: document.title, selection: '' } };
    }
    return { context: { url: location.href, title: document.title } };
  }
};

// State
let state = {
  gatewayUrl: DEFAULT_GATEWAY,
  apiToken: '',
  showThought: false,
  connected: false,
  wsProtocol: 'legacy',
  pageContext: null,
  attachment: null,
  prompts: [],
  agents: [], // Each agent: { id, name, url, token, messages: [] }
  currentAgentId: null,
  activeSocket: null,
  reconnectTimer: null,
  isTyping: false,
  optimizingPrompt: false,
  optimizedPromptBuffer: '',
  preferredProtocol: 'auto'
};

let pendingConnectRequestId = null;
let currentSessionKey = null;

// DOM Elements
const els = {
  statusIndicator: document.getElementById('connection-status'),
  chatContainer: document.getElementById('chat-container'),
  userInput: document.getElementById('user-input'),
  sendBtn: document.getElementById('send-btn'),
  settingsBtn: document.getElementById('settings-btn'),
  settingsModal: document.getElementById('settings-modal'),
  closeSettingsBtn: document.getElementById('close-settings'),
  gatewayInput: document.getElementById('gateway-url'),
  tokenInput: document.getElementById('api-token'),
  settingsStatus: document.getElementById('settings-status'),
  addUrlBtn: document.getElementById('add-url-btn'),
  attachBtn: document.getElementById('attach-btn'),
  fileInput: document.getElementById('file-input'),
  promptsBtn: document.getElementById('prompts-btn'),
  promptsModal: document.getElementById('prompts-modal'),
  closePromptsBtn: document.getElementById('close-prompts'),
  promptsList: document.getElementById('prompts-list'),
  newPromptInput: document.getElementById('new-prompt-input'),
  addPromptBtn: document.getElementById('add-prompt-btn'),
  optimizePromptBtn: document.getElementById('optimize-prompt-btn'),
  home: document.getElementById('home'),
  tipBanner: document.getElementById('tip-banner'),
  tipClose: document.getElementById('tip-close'),
  tipSettingsLink: document.getElementById('tip-settings-link'),
  menuBtn: document.getElementById('menu-btn'),
  menu: document.getElementById('mc-menu'),
  menuOpenPrompts: document.getElementById('menu-open-prompts'),
  menuOpenSettings: document.getElementById('menu-open-settings'),
  modelBtn: document.getElementById('model-btn'),
  currentModelName: document.getElementById('current-model-name'),
  modelMenu: document.getElementById('model-menu'),
  agentList: document.getElementById('agent-list'),
  addAgentBtn: document.getElementById('add-agent-btn')
};

// --- Initialization ---

async function init() {
  await loadSettings();
  setupEventListeners();

  // Check for pending selection from content script
  checkPendingSelection();

  // Connect to the current agent
  connectCurrentAgent();

  renderModelMenu();

  // Auto-focus input
  els.userInput.focus();
}

async function loadSettings() {
  const result = await storage.get(['agents', 'currentAgentId', 'savedPrompts']);
  state.prompts = result.savedPrompts || [];

  // Initialize agents if empty
  if (!result.agents || result.agents.length === 0) {
    // Default agent
    const defaultAgent = {
      id: 'default-' + Date.now(),
      name: 'ChatClaw',
      url: DEFAULT_GATEWAY,
      token: '',
      showThought: false,
      messages: []
    };
    state.agents = [defaultAgent];
    state.currentAgentId = defaultAgent.id;
    await storage.set({ agents: state.agents, currentAgentId: state.currentAgentId });
  } else {
    state.agents = result.agents;
    state.currentAgentId = result.currentAgentId || state.agents[0].id;

    // Ensure all agents have a messages array (migration)
    state.agents.forEach(agent => {
      if (!agent.messages) agent.messages = [];
      if (typeof agent.showThought !== 'boolean') agent.showThought = false;
    });
  }

  updateCurrentAgentState();
  loadChatHistory();
}

function updateCurrentAgentState() {
  const current = state.agents.find(a => a.id === state.currentAgentId) || state.agents[0];
  if (current) {
    state.gatewayUrl = normalizeUrl(current.url);
    state.apiToken = current.token || '';
    state.showThought = !!current.showThought;
    state.preferredProtocol = current.protocol || 'auto';
    if (els.currentModelName) els.currentModelName.textContent = current.name;
  }
}

function loadChatHistory() {
  els.chatContainer.innerHTML = ''; // Clear current view

  const currentAgent = state.agents.find(a => a.id === state.currentAgentId);
  if (currentAgent && currentAgent.messages && currentAgent.messages.length > 0) {
    if (els.home) els.home.classList.add('hidden');

    currentAgent.messages.forEach((msg) => {
      renderMessageToUI(msg.role, msg.content, msg.timestamp, false);
    });

    scrollToBottom();
  } else {
    if (els.home) els.home.classList.remove('hidden');
  }
}

function setupEventListeners() {
  // Input handling
  els.userInput.addEventListener('input', () => {
    resizeTextarea();
    updateSendButton();
  });

  els.userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  els.sendBtn.addEventListener('click', sendMessage);

  // Listen for selection messages from background/content script
  if (isExtensionEnv) {
    chrome.runtime.onMessage.addListener((request) => {
      if (request.action === 'sidebar_selection') {
        appendSelectionToInput(request.selection);
      }
    });
  }

  // Tools
  els.addUrlBtn.addEventListener('click', togglePageContext);

  if (els.attachBtn) {
    els.attachBtn.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', handleFileSelect);
  }

  // Prompts
  if (els.promptsBtn) {
    els.promptsBtn.addEventListener('click', openPrompts);
    els.closePromptsBtn.addEventListener('click', () => els.promptsModal.classList.add('hidden'));
    els.addPromptBtn.addEventListener('click', addPrompt);
    els.optimizePromptBtn?.addEventListener('click', optimizePrompt);
    els.newPromptInput.addEventListener('keydown', (e) => {
      // Allow Shift+Enter for new line in textarea
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        addPrompt();
      }
    });

    // Prompts List Delegation
    els.promptsList.addEventListener('click', (e) => {
      const item = e.target.closest('.prompt-item');
      if (!item) return;
      const index = parseInt(item.dataset.index);

      if (e.target.closest('[data-action="delete-prompt"]')) {
        deletePrompt(e, index);
      } else {
        selectPrompt(index);
      }
    });
  }

  if (els.tipClose) {
    els.tipClose.addEventListener('click', () => {
      els.tipBanner?.classList.add('hidden');
    });
  }

  if (els.tipSettingsLink) {
    els.tipSettingsLink.addEventListener('click', () => {
      els.settingsModal.classList.remove('hidden');
      openSettings();
    });
  }

  document.querySelectorAll('.mc-pill[data-fill="input"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-text') || '';
      if (text) {
        els.userInput.value = text;
        resizeTextarea();
        updateSendButton();
        els.userInput.focus();
      }
    });
  });

  // Settings
  els.settingsBtn.addEventListener('click', () => {
    els.settingsModal.classList.remove('hidden');
    openSettings();
  });

  if (els.modelBtn) {
    els.modelBtn.addEventListener('click', () => {
      els.modelMenu.classList.toggle('hidden');
      renderModelMenu();
    });

    document.addEventListener('click', (e) => {
      if (!els.modelMenu || !els.modelBtn) return;
      if (els.modelMenu.contains(e.target) || els.modelBtn.contains(e.target)) return;
      els.modelMenu.classList.add('hidden');
    });

    // Model Menu Delegation
    els.modelMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="switch-agent"]');
      if (btn) {
        switchAgent(btn.dataset.id);
      }
    });
  }

  if (els.menuBtn && els.menu) {
    els.menuBtn.addEventListener('click', () => {
      els.menu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!els.menu) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest('#mc-menu') || target.closest('#menu-btn')) return;
      els.menu.classList.add('hidden');
    });

    els.menuOpenPrompts?.addEventListener('click', () => {
      els.menu.classList.add('hidden');
      openPrompts();
    });
    els.menuOpenSettings?.addEventListener('click', () => {
      els.menu.classList.add('hidden');
      els.settingsModal.classList.remove('hidden');
      openSettings();
    });
  }

  els.closeSettingsBtn.addEventListener('click', () => {
    els.settingsModal.classList.add('hidden');
  });

  // Agent Management
  els.addAgentBtn.addEventListener('click', () => {
    const newAgent = {
      id: 'agent-' + Date.now(),
      name: 'New Agent',
      url: DEFAULT_GATEWAY,
      token: '',
      messages: []
    };
    state.agents.push(newAgent);
    renderAgentList();
    // Scroll to bottom
    setTimeout(() => {
      els.agentList.scrollTop = els.agentList.scrollHeight;
    }, 50);
  });

  // Agent List Delegation
  els.agentList.addEventListener('click', async (e) => {
    const target = e.target;
    const card = target.closest('.agent-card');
    if (!card) return;
    const id = card.dataset.id;

    if (target.closest('.btn-save')) {
      await saveAgentFromCard(id, card);
    } else if (target.closest('.btn-connect')) {
      await connectAgentFromCard(id, card);
    } else if (target.closest('.delete-agent-btn')) {
      if (confirm('Are you sure you want to delete this agent?')) {
        deleteAgent(id);
      }
    }
  });
}

// --- WebSocket Connection Logic ---

function connectCurrentAgent() {
  if (state.activeSocket) {
    state.activeSocket.close();
    state.activeSocket = null;
  }

  updateConnectionStatus(false);

  if (!state.gatewayUrl) return;

  try {
    console.log('Connecting to:', state.gatewayUrl);
    const ws = new WebSocket(state.gatewayUrl);
    pendingConnectRequestId = null;
    state.wsProtocol = 'legacy';

    ws.onopen = () => {
      console.log('WS Connected');
      updateConnectionStatus(true);

      if (state.preferredProtocol === 'openclaw') {
        sendConnectRequest();
      }
      // Optional: Send handshake/auth if needed
      // ws.send(JSON.stringify({ type: 'hello', token: state.apiToken }));
    };

    ws.onclose = (e) => {
      console.log('WS Closed', e.code, e.reason);

      const wasConnected = state.connected;
      updateConnectionStatus(false);
      state.activeSocket = null;

      // Try to finalize any streaming message if connection drops
      finalizeAgentResponse();

      // Auto-reconnect logic if it wasn't a deliberate close
      if (wasConnected && !state.reconnectTimer) {
        state.reconnectTimer = setTimeout(() => {
          state.reconnectTimer = null;
          connectCurrentAgent();
        }, 3000);
      }
    };

    ws.onerror = (err) => {
      console.error('WS Error', err);
      updateConnectionStatus(false);
      // We don't nullify activeSocket here, onclose will handle it
    };

    ws.onmessage = (e) => {
      console.log('WS Message received:', e.data);
      handleWebSocketMessage(e.data);
    };

    state.activeSocket = ws;
  } catch (err) {
    console.error('Failed to create WebSocket:', err);
    updateConnectionStatus(false);
  }
}

function handleWebSocketMessage(dataStr) {
  try {
    // Check if the message is raw text instead of JSON
    if (typeof dataStr === 'string' && (!dataStr.trim().startsWith('{') && !dataStr.trim().startsWith('['))) {
      console.log('Received plain text WS Message:', dataStr);
      appendAgentResponse(dataStr);
      // We don't finalize immediately here to allow chunked raw text
      // We rely on a timeout to finalize if no more data comes in
      resetFinalizeTimeout();
      return;
    }

    const data = JSON.parse(dataStr);
    console.log('Parsed WS Message:', data);

    // Assume protocol: { type: 'content' | 'error' | 'done', content: '...' }
    // MicroClaw might send: { type: "content", content: "..." }

    // Check if it's an array of messages
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.type === 'content' || item.type === 'message') {
          appendAgentResponse(item.content || item.message || item.text || '');
        } else if (item.type === 'done' || item.type === 'end') {
          finalizeAgentResponse();
        }
      }
      return;
    }

    const content = extractContentText(data);

    if (data.type === 'content' || data.type === 'message') {
      appendAgentResponse(content);
    } else if (data.type === 'res' && (data.id === pendingConnectRequestId || data.id === 'connect') && data.ok) {
      pendingConnectRequestId = null;
      state.wsProtocol = 'openclaw';
      console.log('Handshake successful');
    } else if (data.type === 'event' && isChatEventName(data.event)) {
      handleChatEvent(data.event, data.payload);
    } else if (data.type === 'event' && data.event === 'connect.challenge') {
      if (state.preferredProtocol === 'legacy') return;
      console.log('Responding to connect.challenge');
      sendConnectRequest();
    } else if (data.type === 'res' && (data.id === pendingConnectRequestId || data.id === 'connect') && !data.ok) {
      pendingConnectRequestId = null;
      const errorMessage = data.error?.message || 'Handshake failed';
      updateConnectionStatus(false);
      if (!shouldSuppressInitialAuthError(data.error)) {
        appendAgentResponse(`\n*[Error: ${errorMessage}]*`);
        finalizeAgentResponse();
      }
    } else if (data.type === 'res' && data.id && String(data.id).startsWith('chat-') && data.ok) {
      const chatContent = extractContentText(data.payload || {});
      if (chatContent) {
        appendAgentResponse(chatContent);
      }
      if (chatContent) {
        finalizeAgentResponse();
      }
    } else if (data.type === 'res' && data.ok === false) {
      const errorMessage = data.error?.message || 'Request failed';
      appendAgentResponse(`\n*[Error: ${errorMessage}]*`);
      finalizeAgentResponse();
    } else if (data.type === 'error') {
      appendAgentResponse(`\n*[Error: ${data.message || 'Unknown error'}]*`);
      finalizeAgentResponse();
    } else if (data.type === 'done' || data.type === 'end') {
      finalizeAgentResponse();
    } else if (data.type === 'ping') {
      state.activeSocket.send(JSON.stringify({ type: 'pong' }));
    } else if (content) {
      // Fallback: if there's content but no recognized type, append it
      appendAgentResponse(content);
    }

  } catch (err) {
    console.warn('Failed to parse WS message:', err);
    // If parsing fails but it's not strictly JSON starting with {
    if (typeof dataStr === 'string') {
      appendAgentResponse(dataStr);
      resetFinalizeTimeout();
    }
  }
}

function shouldSuppressInitialAuthError(error) {
  if (!isUnauthorizedError(error)) return false;
  const current = state.agents.find(a => a.id === state.currentAgentId);
  const hasHistory = !!(current && Array.isArray(current.messages) && current.messages.length > 0);
  return !hasHistory;
}

function isUnauthorizedError(error) {
  if (!error) return false;
  const code = String(error.code || '').toLowerCase();
  const message = String(error.message || '').toLowerCase();
  return code.includes('unauthorized') || message.includes('unauthorized');
}

function extractContentText(data) {
  if (!data || typeof data !== 'object') return '';
  const direct = data.content || data.text || data.delta || data.final || data.response || '';
  if (typeof direct === 'string' && direct) return direct;
  if (Array.isArray(direct)) {
    const directArrayText = extractTextFromContentBlocks(direct);
    if (directArrayText) return directArrayText;
  }

  if (data.message) {
    if (typeof data.message === 'string') return data.message;
    if (typeof data.message === 'object') {
      const messageText = extractContentText(data.message);
      if (messageText) return messageText;
    }
  }

  const payload = data.payload && typeof data.payload === 'object' ? data.payload : null;
  if (!payload) return '';
  const payloadText = payload.content || payload.message || payload.text || payload.delta || payload.final || payload.response || '';
  if (typeof payloadText === 'string' && payloadText) return payloadText;
  if (Array.isArray(payloadText)) {
    const payloadArrayText = extractTextFromContentBlocks(payloadText);
    if (payloadArrayText) return payloadArrayText;
  }

  if (Array.isArray(payload.blocks)) {
    const blocksText = extractTextFromContentBlocks(payload.blocks);
    if (blocksText) return blocksText;
  }

  return '';
}

function extractTextFromContentBlocks(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .map((block) => {
      if (!block) return '';
      if (typeof block === 'string') return block;
      if (typeof block !== 'object') return '';
      if (typeof block.text === 'string') return block.text;
      if (typeof block.content === 'string') return block.content;
      if (Array.isArray(block.content)) return extractTextFromContentBlocks(block.content);
      return '';
    })
    .filter(Boolean)
    .join('');
}

function isChatEventName(eventName) {
  if (!eventName) return false;
  return eventName === 'chat' || eventName.startsWith('chat.') || eventName.startsWith('chat:');
}

function handleChatEvent(eventName, payload) {
  if (payload && currentSessionKey && payload.sessionKey && payload.sessionKey !== currentSessionKey) {
    return;
  }

  const text = extractContentText(payload || {});
  const state = payload?.state || payload?.phase || '';
  if (eventName === 'chat') {
    if (state === 'final') {
      appendFinalResponse(text);
      finalizeAgentResponse();
      return;
    }
    if (state === 'error') {
      const message = text || payload?.error?.message || payload?.message || 'Unknown error';
      appendAgentResponse(`\n*[Error: ${message}]*`);
      finalizeAgentResponse();
      return;
    }
    if (text) {
      appendAgentResponse(text);
      return;
    }
  }

  if (eventName.endsWith('.delta') || eventName.endsWith(':delta')) {
    if (text) appendAgentResponse(text);
    return;
  }

  if (eventName.endsWith('.final') || eventName.endsWith(':final')) {
    appendFinalResponse(text);
    finalizeAgentResponse();
    return;
  }

  if (eventName.endsWith('.error') || eventName.endsWith(':error')) {
    const message = text || payload?.error?.message || payload?.message || 'Unknown error';
    appendAgentResponse(`\n*[Error: ${message}]*`);
    finalizeAgentResponse();
    return;
  }

  if (text) {
    appendAgentResponse(text);
  }
}

function appendFinalResponse(text) {
  if (!text) return;
  if (!currentStreamingMessageId || !currentStreamingContent) {
    appendAgentResponse(text);
    return;
  }
  if (currentStreamingContent === text) {
    return;
  }
  if (text.startsWith(currentStreamingContent)) {
    const rest = text.slice(currentStreamingContent.length);
    if (rest) appendAgentResponse(rest);
    return;
  }
  if (currentStreamingContent.startsWith(text)) {
    return;
  }
  appendAgentResponse(text);
}

let currentStreamingMessageId = null;
let currentStreamingContent = '';

let finalizeTimeout = null;

function resetFinalizeTimeout() {
  if (finalizeTimeout) clearTimeout(finalizeTimeout);
  finalizeTimeout = setTimeout(() => {
    finalizeAgentResponse();
  }, 1000); // 1s without data -> finalize
}

function appendAgentResponse(text) {
  if (state.optimizingPrompt) {
    state.optimizedPromptBuffer += text;
    resetFinalizeTimeout();
    return;
  }

  if (!text) return;
  if (!currentStreamingContent && /^\s+$/.test(text)) return;
  if (!currentStreamingMessageId) {
    // Start new message
    currentStreamingMessageId = renderMessageToUI('agent', '');
    currentStreamingContent = '';
  }

  const msgEl = document.getElementById(currentStreamingMessageId);
  if (!msgEl) return;
  const bubble = msgEl.querySelector('.message-bubble');

  // Remove typing indicator if present
  const typingDots = bubble.querySelector('.typing-dots');
  if (typingDots) {
    bubble.innerHTML = '';
  }

  currentStreamingContent += text;
  renderMarkdown(bubble, currentStreamingContent);
  scrollToBottom();

  // Every time we append, we reset the finalize timeout
  resetFinalizeTimeout();
}

function finalizeAgentResponse() {
  if (finalizeTimeout) {
    clearTimeout(finalizeTimeout);
    finalizeTimeout = null;
  }

  if (state.optimizingPrompt) {
    // Done optimizing
    if (state.optimizedPromptBuffer.trim()) {
      els.newPromptInput.value = state.optimizedPromptBuffer.trim();
    }
    state.optimizingPrompt = false;
    state.optimizedPromptBuffer = '';

    if (els.optimizePromptBtn) {
      els.optimizePromptBtn.disabled = false;
      els.optimizePromptBtn.innerHTML = '<span>✨ Optimize</span>';
    }
    return;
  }

  if (currentStreamingMessageId) {
    // Save to history
    saveMessageToHistory('agent', currentStreamingContent);
    currentStreamingMessageId = null;
    currentStreamingContent = '';
  }
  state.isTyping = false;
}

function normalizeUrl(url) {
  let trimmed = url.trim();
  if (!trimmed) return DEFAULT_GATEWAY;

  // Enforce ws:// or wss://
  if (trimmed.startsWith('http://')) {
    trimmed = 'ws://' + trimmed.slice(7);
  } else if (trimmed.startsWith('https://')) {
    trimmed = 'wss://' + trimmed.slice(8);
  } else if (!trimmed.startsWith('ws://') && !trimmed.startsWith('wss://')) {
    trimmed = 'ws://' + trimmed;
  }

  trimmed = trimmed.replace(/\/+$/, '');

  // For MicroClaw, ensure it connects to the /ws endpoint if it's the root
  if (!trimmed.endsWith('/ws') && trimmed.split('/').length <= 3) {
    trimmed += '/ws';
  }

  return trimmed;
}

function makeRequestId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sendConnectRequest() {
  if (!state.activeSocket || state.activeSocket.readyState !== WebSocket.OPEN) return;
  const requestId = makeRequestId('connect');
  pendingConnectRequestId = requestId;
  state.wsProtocol = 'openclaw';
  state.activeSocket.send(JSON.stringify({
    type: 'req',
    id: requestId,
    method: 'connect',
    params: {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      auth: {
        token: state.apiToken || ''
      },
      preferences: {
        includeThoughts: state.showThought
      }
    }
  }));
}

function getCurrentSessionKey() {
  const current = state.agents.find(a => a.id === state.currentAgentId);
  if (!current) return 'chatclaw';
  const base = current.name || current.id || 'chatclaw';
  return `chatclaw:${base}`.replace(/[^\w:-]/g, '-');
}

function buildChatSendMessage(text, context, attachment) {
  let merged = text;
  if (context && Object.keys(context).length > 0) {
    merged += `\n\n[PageContext]\n${JSON.stringify(context)}`;
  }
  if (attachment) {
    merged += `\n\n[Attachment]\nFilename: ${attachment.filename || ''}\nContent:\n${attachment.content || ''}`;
  }
  return merged;
}

function updateConnectionStatus(connected) {
  state.connected = connected;
  const statusEl = document.getElementById('connection-status');
  if (connected) {
    statusEl.classList.remove('disconnected');
    statusEl.classList.add('connected');
    statusEl.title = 'Connected';
  } else {
    statusEl.classList.remove('connected');
    statusEl.classList.add('disconnected');
    statusEl.title = 'Disconnected';
  }

  // Also update UI in settings if open
  renderAgentList(); // Re-render to show status dots
}

// --- Agent Management Logic ---

function renderModelMenu() {
  if (!els.modelMenu) return;

  els.modelMenu.innerHTML = state.agents.map(agent => `
    <button class="mc-menu-item ${agent.id === state.currentAgentId ? 'active' : ''}" 
            data-action="switch-agent" data-id="${agent.id}">
      ${escapeHtml(agent.name)}
      ${agent.id === state.currentAgentId ? ' ✓' : ''}
    </button>
  `).join('');
}

function switchAgent(id) {
  // if (id === state.currentAgentId) {
  //   els.modelMenu.classList.add('hidden');
  //   return;
  // }

  state.currentAgentId = id;
  storage.set({ currentAgentId: id });

  updateCurrentAgentState();

  // Switch Context
  loadChatHistory();

  // Reconnect using the NEW configuration
  connectCurrentAgent();

  els.modelMenu.classList.add('hidden');
}

window.switchAgent = switchAgent; // Keep global for safety, but delegation is preferred

function openSettings() {
  renderAgentList();
}

function renderAgentList() {
  els.agentList.innerHTML = state.agents.map(agent => {
    const isCurrent = agent.id === state.currentAgentId;
    const isConnected = isCurrent && state.connected;

    return `
    <div class="agent-card ${isCurrent ? 'active' : ''}" data-id="${agent.id}">
      <div class="field-group">
        <div class="field-header-row">
          <label class="field-label">Agent 名称</label>
          <div class="agent-controls">
             ${state.agents.length > 1 ? `<button class="delete-agent-btn" title="删除">🗑️</button>` : ''}
          </div>
        </div>
        <input type="text" class="field-input agent-name" value="${escapeHtml(agent.name)}">
      </div>
      
      <div class="field-group">
        <label class="field-label">Agent 网关地址</label>
        <input type="text" class="field-input agent-url" value="${escapeHtml(agent.url)}" placeholder="ws://127.0.0.1:10961/ws">
      </div>
      
      <div class="field-group">
        <label class="field-label">Auth Token</label>
        <input type="password" class="field-input agent-token" value="${escapeHtml(agent.token || '')}" placeholder="Optional">
      </div>

      <div class="field-group">
        <label class="field-label">Protocol</label>
        <select class="field-input agent-protocol">
          <option value="auto" ${(!agent.protocol || agent.protocol === 'auto') ? 'selected' : ''}>Auto-detect</option>
          <option value="openclaw" ${agent.protocol === 'openclaw' ? 'selected' : ''}>OpenClaw</option>
          <option value="legacy" ${agent.protocol === 'legacy' ? 'selected' : ''}>Legacy</option>
        </select>
      </div>

      <div class="field-group">
        <label class="field-label">
          <input type="checkbox" class="agent-show-thought" ${agent.showThought ? 'checked' : ''}>
          显示模型思考过程（thought）
        </label>
      </div>

      <div class="agent-card-actions">
        <button class="btn-action btn-save">保存</button>
        <button class="btn-action btn-connect">测试连接</button>
      </div>
      
      <div class="agent-card-footer">
        <span class="connection-status-text ${isConnected ? 'connected' : ''}" id="status-${agent.id}">
            ${isConnected ? '连接测试通过' : (isCurrent ? '' : '')}
        </span>
      </div>
    </div>
  `;
  }).join('');
}

async function saveAgentFromCard(id, card) {
  const nameInput = card.querySelector('.agent-name');
  const urlInput = card.querySelector('.agent-url');
  const tokenInput = card.querySelector('.agent-token');
  const protocolInput = card.querySelector('.agent-protocol');
  const showThoughtInput = card.querySelector('.agent-show-thought');

  const name = nameInput.value.trim();
  let url = urlInput.value.trim();
  const token = tokenInput.value.trim();
  const protocol = protocolInput ? protocolInput.value : 'auto';
  const showThought = !!showThoughtInput?.checked;

  // URL Validation
  if (!name || !url) {
    alert('Name and URL are required');
    return;
  }

  if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
    // Try to fix it if it starts with http
    if (url.startsWith('http://')) {
      url = 'ws://' + url.slice(7);
    } else if (url.startsWith('https://')) {
      url = 'wss://' + url.slice(8);
    } else {
      url = 'ws://' + url;
    }
    // Update UI if we modified it
    if (urlInput) urlInput.value = url;
  }

  // Double check
  if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
    alert('URL must start with ws:// or wss://');
    return;
  }

  // Auto-append /ws if it's not present (common requirement for some servers)
  // But microclaw might expect exactly the path given or a specific path.
  // We'll trust the user input here as long as it's ws://

  const agentIndex = state.agents.findIndex(a => a.id === id);
  if (agentIndex !== -1) {
    state.agents[agentIndex] = { ...state.agents[agentIndex], name, url, token, showThought, protocol };
    await storage.set({ agents: state.agents });

    // Show feedback for save action
    const statusEl = card.querySelector(`#status-${agentIndex !== -1 ? state.agents[agentIndex].id : id}`);
    if (statusEl) {
      statusEl.textContent = '已保存配置';
      statusEl.className = 'connection-status-text connected'; // Optional: Use green color or a neutral one
      setTimeout(() => {
        // Clear message after 2s
        if (statusEl.textContent === '已保存配置') {
          statusEl.textContent = '';
        }
      }, 2000);
    }

    // NOTE: We do NOT auto-reconnect here anymore to prevent confusing UI states.
    // The user must manually switch agents or restart the plugin to apply changes if it's the current agent.
    if (state.currentAgentId === id) {
      updateCurrentAgentState();
      // Only update internal state, do NOT call connectCurrentAgent()
    }
  }
}

async function connectAgentFromCard(id, card) {
  const statusEl = card.querySelector(`#status-${id}`);
  statusEl.textContent = '测试连接中...';
  statusEl.className = 'connection-status-text';

  let url = card.querySelector('.agent-url').value.trim();
  const token = card.querySelector('.agent-token').value.trim();
  const protocol = card.querySelector('.agent-protocol') ? card.querySelector('.agent-protocol').value : 'auto';

  // Temp normalize for test
  url = normalizeUrl(url);

  const result = await testAgentConnection(url, token, protocol);

  if (result.ok) {
    statusEl.textContent = '连接测试通过';
    statusEl.className = 'connection-status-text connected';

    // Auto save on success but DO NOT show the "已保存配置" UI feedback 
    // to avoid overriding the test result.
    const agentIndex = state.agents.findIndex(a => a.id === id);
    if (agentIndex !== -1) {
      state.agents[agentIndex] = { ...state.agents[agentIndex], name: card.querySelector('.agent-name').value.trim(), url, token, showThought: !!card.querySelector('.agent-show-thought')?.checked, protocol };
      await storage.set({ agents: state.agents });
      if (state.currentAgentId === id) {
        updateCurrentAgentState();
      }
    }

    // Note: We don't automatically switch agent or reconnect global socket here
    // to avoid UI flicker. User can switch agent manually if desired.

    // If we just tested a NEW agent (not current), renderAgentList will show updated list but not switch.
    // NOTE: We only want to update the specific card's UI, not re-render the whole list, 
    // to avoid resetting the DOM state (which causes the status message to disappear).
    // The status message was just set on the DOM node directly above.

    // Instead of renderAgentList(), we just update the card's internal state implicitly 
    // via saveAgentFromCard and let the DOM manipulation above persist.

  } else {
    statusEl.textContent = `连接失败: ${result.error}`;
    statusEl.className = 'connection-status-text error';
  }
}

function deleteAgent(id) {
  state.agents = state.agents.filter(a => a.id !== id);
  if (state.currentAgentId === id && state.agents.length > 0) {
    switchAgent(state.agents[0].id);
  } else if (state.agents.length === 0) {
    // Create default if all deleted
    const defaultAgent = {
      id: 'default-' + Date.now(),
      name: 'ChatClaw',
      url: DEFAULT_GATEWAY,
      token: '',
      showThought: false,
      messages: []
    };
    state.agents.push(defaultAgent);
    switchAgent(defaultAgent.id);
  } else {
    storage.set({ agents: state.agents });
  }
  renderAgentList();
}

function testAgentConnection(url, token, protocol = 'auto') {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(url);
      let resolved = false;
      let connectTimer = null;
      const connectRequestId = makeRequestId('connect-test');

      const settle = (result) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        if (connectTimer) clearTimeout(connectTimer);
        // Always close test connection
        try { ws.close(); } catch (_) { }
        resolve(result);
      };

      const timeout = setTimeout(() => {
        settle({ ok: false, error: 'Timeout' });
      }, 5000);

      ws.onopen = () => {
        if (protocol === 'openclaw') {
          ws.send(JSON.stringify({
            type: 'req',
            id: connectRequestId,
            method: 'connect',
            params: {
              minProtocol: PROTOCOL_VERSION,
              maxProtocol: PROTOCOL_VERSION,
              auth: { token: token || '' }
            }
          }));
        }
        connectTimer = setTimeout(() => {
          settle({ ok: true });
        }, 800);
      };

      ws.onmessage = (e) => {
        let data;
        try {
          data = JSON.parse(e.data);
        } catch (_) {
          return;
        }
        if (data?.type === 'event' && data?.event === 'connect.challenge') {
          ws.send(JSON.stringify({
            type: 'req',
            id: connectRequestId,
            method: 'connect',
            params: {
              minProtocol: PROTOCOL_VERSION,
              maxProtocol: PROTOCOL_VERSION,
              auth: { token: token || '' }
            }
          }));
          return;
        }
        if (data?.type === 'res' && data?.id === connectRequestId) {
          if (data.ok) {
            settle({ ok: true });
          } else {
            const message = data?.error?.message || 'Handshake failed';
            settle({ ok: false, error: message });
          }
        }
      };

      ws.onerror = () => {
        settle({ ok: false, error: 'Connection Error' });
      };

    } catch (err) {
      resolve({ ok: false, error: err.message });
    }
  });
}

// --- Chat Logic ---

async function checkPendingSelection() {
  if (!isExtensionEnv) return;
  const result = await chrome.storage.local.get('pendingSelection');
  if (result.pendingSelection) {
    appendSelectionToInput(result.pendingSelection);
    chrome.storage.local.remove('pendingSelection');
  }
}

function appendSelectionToInput(text) {
  const formatted = `Selected Context: \n${text}\n\n---\n`;
  els.userInput.value = els.userInput.value ? els.userInput.value + '\n' + formatted : formatted;
  resizeTextarea();
  updateSendButton();
  els.userInput.focus();
}

async function togglePageContext() {
  if (state.pageContext) {
    state.pageContext = null;
    els.addUrlBtn.classList.remove('active');
    els.addUrlBtn.setAttribute('data-tooltip', "阅读此页");
    els.addUrlBtn.removeAttribute('title');
  } else {
    try {
      const tabs = await tabsApi.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        let title = tabs[0].title;
        let url = tabs[0].url;

        // Try to get full context from content script if available
        try {
          const response = await tabsApi.sendMessage(tabs[0].id, { type: 'collect-basic-context' });
          if (response && response.context) {
            title = response.context.title || title;
            url = response.context.url || url;
          }
        } catch (e) {
          // Content script might not be loaded, use tab info
        }

        state.pageContext = { title, url };

        const formattedContext = `Title: ${title}\nURL: ${url}\n\n---\n`;

        // Append to input
        els.userInput.value = els.userInput.value ? els.userInput.value + '\n' + formattedContext : formattedContext;

        els.addUrlBtn.classList.add('active');
        els.addUrlBtn.setAttribute('data-tooltip', `已添加: ${title.slice(0, 15)}...`);
        els.addUrlBtn.removeAttribute('title');

        // Update UI
        resizeTextarea();
        updateSendButton();
        els.userInput.focus();
      }
    } catch (err) {
      console.error('Failed to get tab info:', err);
    }
  }
}

async function sendMessage() {
  const text = els.userInput.value.trim();
  if (!text) return;

  if (!state.connected || !state.activeSocket) {
    // Try reconnect
    connectCurrentAgent();
    // Wait a bit? Or just alert
    // For UX, maybe just show error message
    if (!state.activeSocket || state.activeSocket.readyState !== WebSocket.OPEN) {
      renderMessageToUI('agent', '*Error: Not connected to agent. Please check settings.*');
      return;
    }
  }

  if (els.home) els.home.classList.add('hidden');

  // Clear input
  els.userInput.value = '';
  resizeTextarea();
  updateSendButton();

  // Add User Message
  renderMessageToUI('user', text);
  saveMessageToHistory('user', text);

  // Prepare Payload
  const payload = {
    source: 'sidebar',
    role: 'user',
    message: text,
    context: state.pageContext || {}
  };

  if (state.attachment) {
    payload.context.attachment = state.attachment;
    // Reset attachment
    state.attachment = null;
    els.attachBtn.classList.remove('active');
    els.attachBtn.setAttribute('data-tooltip', "附加文件");
    els.attachBtn.removeAttribute('title');
  }

  // Send via WebSocket
  try {
    const mergedMessage = buildChatSendMessage(text, payload.context, payload.context.attachment);
    const sessionKey = getCurrentSessionKey();
    currentSessionKey = sessionKey;
    const wsPayload = state.wsProtocol === 'openclaw'
      ? {
        type: 'req',
        id: makeRequestId('chat'),
        method: 'chat.send',
        params: {
          sessionKey,
          message: mergedMessage,
          idempotencyKey: makeRequestId('idem')
        }
      }
      : {
        type: 'message',
        payload: payload
      };
    state.activeSocket.send(JSON.stringify(wsPayload));
    state.isTyping = true;

    // Add Placeholder
    const agentMsgId = renderMessageToUI('agent', '');
    currentStreamingMessageId = agentMsgId;
    const agentBubble = document.getElementById(agentMsgId).querySelector('.message-bubble');
    agentBubble.innerHTML = '<span class="typing-dots">...</span>';

  } catch (err) {
    console.error("Send failed", err);
    renderMessageToUI('agent', `*Error sending message: ${err.message}*`);
  }
}

function saveMessageToHistory(role, content) {
  const currentAgent = state.agents.find(a => a.id === state.currentAgentId);
  if (currentAgent) {
    if (!currentAgent.messages) currentAgent.messages = [];
    currentAgent.messages.push({
      role,
      content,
      timestamp: Date.now()
    });
    // Persist
    storage.set({ agents: state.agents });
  }
}

// --- UI Helpers ---

function renderMessageToUI(role, content, timestamp, shouldScroll = true) {
  const id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.id = id;

  const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

  div.innerHTML = `
    <div class="message-bubble"></div>
    <div class="message-meta">${timeStr}</div>
  `;

  // Render markdown if content exists
  const bubble = div.querySelector('.message-bubble');
  if (content) {
    renderMarkdown(bubble, content);
  }

  els.chatContainer.appendChild(div);
  if (shouldScroll) scrollToBottom();

  if (els.home) els.home.classList.add('hidden');

  return id;
}

function renderMarkdown(element, text) {
  // Simple markdown renderer: handles code blocks and basic formatting
  // For production, use a library like marked.js

  let html = escapeHtml(text);

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Code blocks (naive)
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Newlines to <br>
  html = html.replace(/\n/g, '<br>');

  element.innerHTML = html;
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function resizeTextarea() {
  const el = els.userInput;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function updateSendButton() {
  els.sendBtn.disabled = !els.userInput.value.trim();
}

function scrollToBottom() {
  els.chatContainer.scrollTop = els.chatContainer.scrollHeight;
}

// --- Attachment Logic ---

async function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  // Simple check for text files
  if (file.type.startsWith('text/') || file.name.match(/\.(txt|md|js|ts|py|json|html|css|csv)$/)) {
    const text = await file.text();
    state.attachment = {
      name: file.name,
      content: text.slice(0, 50000) // Limit size
    };
    els.attachBtn.classList.add('active');
    els.attachBtn.setAttribute('data-tooltip', `已添加: ${file.name}`);
    els.attachBtn.removeAttribute('title');

    // Auto-fill input if empty
    if (!els.userInput.value.trim()) {
      els.userInput.value = `Analyze this file: ${file.name}`;
      updateSendButton();
    }
  } else {
    alert('Only text files are supported for now.');
    els.fileInput.value = '';
  }
}

// --- Prompts Logic ---

async function optimizePrompt() {
  const text = els.newPromptInput.value.trim();
  if (!text) return;

  if (!state.connected || !state.activeSocket) {
    alert('Please verify your connection to use AI features.');
    return;
  }

  state.optimizingPrompt = true;
  state.optimizedPromptBuffer = '';

  const originalBtnText = els.optimizePromptBtn ? els.optimizePromptBtn.innerHTML : '✨ Optimize';
  if (els.optimizePromptBtn) {
    els.optimizePromptBtn.disabled = true;
    els.optimizePromptBtn.innerHTML = '<span>⏳ Optimizing...</span>';
  }

  const prompt = `Optimize the following user prompt for better LLM performance. Return ONLY the optimized prompt text without any explanation or markdown formatting:\n\n${text}`;

  // Construct payload manually to avoid UI side effects of sendMessage
  const payload = {
    source: 'sidebar',
    role: 'user',
    message: prompt,
    context: {}
  };

  try {
    const sessionKey = getCurrentSessionKey();
    const wsPayload = state.wsProtocol === 'openclaw'
      ? {
        type: 'req',
        id: makeRequestId('chat'),
        method: 'chat.send',
        params: {
          sessionKey,
          message: prompt,
          idempotencyKey: makeRequestId('idem')
        }
      }
      : {
        type: 'message',
        payload: payload
      };

    state.activeSocket.send(JSON.stringify(wsPayload));

    // Timeout safeguard
    setTimeout(() => {
      if (state.optimizingPrompt) {
        state.optimizingPrompt = false;
        if (els.optimizePromptBtn) {
          els.optimizePromptBtn.disabled = false;
          els.optimizePromptBtn.innerHTML = originalBtnText;
        }
      }
    }, 30000);

  } catch (err) {
    console.error("Optimization failed", err);
    state.optimizingPrompt = false;
    if (els.optimizePromptBtn) {
      els.optimizePromptBtn.disabled = false;
      els.optimizePromptBtn.innerHTML = originalBtnText;
    }
    alert('Failed to send request');
  }
}

async function openPrompts() {
  const res = await storage.get(['savedPrompts']);
  state.prompts = res.savedPrompts || [];
  renderPrompts();
  els.promptsModal.classList.remove('hidden');
}

function renderPrompts() {
  els.promptsList.innerHTML = state.prompts.map((p, i) => `
    <div class="prompt-item" data-index="${i}">
      <span class="prompt-text">${escapeHtml(p)}</span>
      <span class="delete-prompt-btn" data-action="delete-prompt">&times;</span>
    </div>
  `).join('');
}

async function addPrompt() {
  const text = els.newPromptInput.value.trim();
  if (!text) return;

  state.prompts.push(text);
  await storage.set({ savedPrompts: state.prompts });

  els.newPromptInput.value = '';
  renderPrompts();
}

async function deletePrompt(e, index) {
  e.stopPropagation();
  state.prompts.splice(index, 1);
  await storage.set({ savedPrompts: state.prompts });
  renderPrompts();
}

function selectPrompt(index) {
  const text = state.prompts[index];
  if (text) {
    els.userInput.value = text;
    resizeTextarea();
    updateSendButton();
    els.promptsModal.classList.add('hidden');
    els.userInput.focus();
  }
}

// Expose to global scope for HTML onclick
window.selectPrompt = selectPrompt;
window.deletePrompt = deletePrompt;

// Start
// Use DOMContentLoaded to ensure elements are ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
