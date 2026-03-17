
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
  preferredProtocol: 'auto',
  // New State
  editingPromptId: null,
  slashCommandActive: false,
  slashCommandIndex: 0,
  slashCommandQuery: ''
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
  // ... (keep existing)
  addUrlBtn: document.getElementById('add-url-btn'),
  attachBtn: document.getElementById('attach-btn'),
  fileInput: document.getElementById('file-input'),
  promptsBtn: document.getElementById('prompts-btn'),
  promptsModal: document.getElementById('prompts-modal'),
  closePromptsBtn: document.getElementById('close-prompts'),

  // New Prompt Elements
  promptsList: document.getElementById('prompts-list'),
  promptsListView: document.getElementById('prompts-list-view'), // New wrapper
  promptSearch: document.getElementById('prompt-search'),
  createPromptBtn: document.getElementById('create-prompt-btn'),
  promptEditor: document.getElementById('prompt-editor'),
  // editorEmptyState removed
  backToListBtn: document.getElementById('back-to-list-btn'), // New Back Button
  editorTitle: document.getElementById('editor-title'),
  editPromptName: document.getElementById('edit-prompt-name'),
  editPromptContent: document.getElementById('edit-prompt-content'),
  editPromptIconDisplay: document.getElementById('edit-prompt-icon-display'),
  changeIconBtn: document.getElementById('change-icon-btn'),
  emojiPicker: document.getElementById('emoji-picker'),
  emojiSearch: document.getElementById('emoji-search'),
  emojiGrid: document.getElementById('emoji-grid'),
  cancelPromptBtn: document.getElementById('cancel-prompt-btn'),
  savePromptBtn: document.getElementById('save-prompt-btn'),

  slashPopup: document.getElementById('slash-popup'),

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
  addAgentBtn: document.getElementById('add-agent-btn'),
  enableFloatBtn: document.getElementById('setting-enable-float-btn')
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
  const result = await storage.get(['agents', 'currentAgentId', 'savedPrompts', 'enableFloatBtn']);
  state.prompts = result.savedPrompts || [];

  // Migration: Convert strings to objects
  if (state.prompts.length > 0 && typeof state.prompts[0] === 'string') {
    state.prompts = state.prompts.map(p => ({
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      name: p.length > 15 ? p.slice(0, 15) + '...' : p,
      content: p,
      icon: '💡'
    }));
    await storage.set({ savedPrompts: state.prompts });
  }

  // Handle float button setting (default to true)
  if (els.enableFloatBtn) {
    els.enableFloatBtn.checked = result.enableFloatBtn !== false;
  }

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
    handleSlashCommandInput();
  });

  els.userInput.addEventListener('keydown', (e) => {
    if (state.slashCommandActive) {
      handleSlashCommandKeydown(e);
      return;
    }
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

  // Prompts Management
  if (els.promptsBtn) {
    els.promptsBtn.addEventListener('click', openPrompts);
    els.closePromptsBtn.addEventListener('click', () => els.promptsModal.classList.add('hidden'));

    els.createPromptBtn?.addEventListener('click', createPrompt);

    els.promptSearch?.addEventListener('input', (e) => {
      renderPrompts(e.target.value);
    });

    els.changeIconBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEmojiPicker();
    });

    els.emojiSearch?.addEventListener('input', (e) => {
      renderEmojiGrid(e.target.value);
    });

    els.cancelPromptBtn?.addEventListener('click', () => {
      closeEditor();
    });

    els.backToListBtn?.addEventListener('click', () => {
      closeEditor();
    });

    els.savePromptBtn?.addEventListener('click', savePrompt);

    // Click outside to close emoji picker
    document.addEventListener('click', (e) => {
      if (els.emojiPicker && !els.emojiPicker.classList.contains('hidden')) {
        if (!e.target.closest('.icon-selector')) {
          els.emojiPicker.classList.add('hidden');
        }
      }

      // Close slash popup if clicked outside
      if (state.slashCommandActive && !e.target.closest('#slash-popup') && !e.target.closest('#user-input')) {
        closeSlashPopup();
      }
    });

    // Prompts List Delegation (Select, Delete, Drag)
    els.promptsList.addEventListener('click', (e) => {
      const item = e.target.closest('.prompt-item');
      if (!item) return;
      const index = parseInt(item.dataset.index);

      if (e.target.closest('.delete-prompt-btn')) {
        deletePrompt(e, index);
      } else {
        editPrompt(index);
      }
    });

    // Drag and Drop Events
    els.promptsList.addEventListener('dragstart', handleDragStart);
    els.promptsList.addEventListener('dragover', handleDragOver);
    els.promptsList.addEventListener('drop', handleDrop);
    els.promptsList.addEventListener('dragend', handleDragEnd);
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

  if (els.enableFloatBtn) {
    els.enableFloatBtn.addEventListener('change', (e) => {
      storage.set({ enableFloatBtn: e.target.checked });
    });
  }

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
  const typingDots = bubble.querySelector('.typing-indicator');
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
  const formatted = `划线选中内容: \n${text}\n---\n`;
  els.userInput.value = els.userInput.value ? els.userInput.value + '\n' + formatted : formatted;
  resizeTextarea();
  updateSendButton();
  els.userInput.focus();
}

async function togglePageContext() {
  if (state.pageContext) {
    state.pageContext = null;
    els.addUrlBtn.classList.remove('active');
    els.addUrlBtn.setAttribute('data-tooltip', "添加此页元数据");
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

        const formattedContext = `网页标题: ${title}\nURL链接: ${url}\n---\n`;

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
    agentBubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

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

function isMarkdown(text) {
  if (!text) return false;
  const hasCodeBlock = /```/.test(text);
  const hasHeader = /^#{1,6}\s+.+/m.test(text);
  const hasList = /^\s*[-*+]\s+.+/m.test(text) || /^\s*\d+\.\s+.+/m.test(text);
  const hasQuote = /^\s*>.+/m.test(text);
  const hasLink = /\[.+?\]\(.+?\)/.test(text);
  const hasBold = /\*\*(.*?)\*\*/.test(text);

  return hasCodeBlock || hasHeader || hasList || hasQuote || hasLink || hasBold;
}

function renderMarkdown(element, text) {
  if (!text) {
    element.innerHTML = '';
    return;
  }

  // Preprocess text to prevent tags like #PARA/Resource from being treated as headers
  // Replaces # followed by non-space characters with its HTML entity &#35;
  let processedText = text.replace(/(^|\s)#([^\s#]+)/g, '$1&#35;$2');

  // If text contains Markdown syntax and marked is loaded, use it
  if (isMarkdown(text) && typeof marked !== 'undefined') {
    element.innerHTML = marked.parse(processedText);
    return;
  }

  // Fallback to simple default rendering for plain text
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

const COMMON_EMOJIS = [
  '💡', '📝', '✨', '🔍', '🚀', '💻', '🎨', '📊', '📅', '📧',
  '🤖', '📚', '🧠', '⚙️', '🔧', '🔨', '🎉', '🔥', '⭐', '❤️',
  '👍', '👎', '✅', '❌', '❓', '❗', '⚠️', '🌐', '🔗', '🔒',
  '🔓', '🔑', '🛒', '💰', '💳', '💵', '💶', '💷', '💴', '🏠',
  '🏢', '🏥', '🏦', '🏨', '🏫', '🎓', '🎤', '🎧', '🎵', '🎹'
];

async function openPrompts() {
  const res = await storage.get(['savedPrompts']);
  state.prompts = res.savedPrompts || [];

  // Reset UI
  els.promptSearch.value = '';
  els.promptEditor.classList.add('hidden');
  els.promptsListView.classList.remove('hidden'); // Show list view
  state.editingPromptId = null;

  renderPrompts();
  els.promptsModal.classList.remove('hidden');
}

function renderPrompts(filterText = '') {
  const list = els.promptsList;
  list.innerHTML = '';

  const filtered = state.prompts.filter(p => {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.content.toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--mc-text-3);">没有找到提示词</div>';
    return;
  }

  filtered.forEach((p, i) => {
    const isEditing = state.editingPromptId === p.id;
    const el = document.createElement('div');
    el.className = `prompt-item ${isEditing ? 'active' : ''}`;
    el.draggable = true;
    el.dataset.index = i; // Note: Index in filtered list might differ from state.prompts if filtered. 
    // Ideally we should use ID for operations, but for drag-drop we need index in current view.
    // If filtering is active, disable drag-drop or handle carefully.
    // For simplicity, we only enable drag-drop when not filtering.
    if (filterText) el.draggable = false;
    el.dataset.id = p.id;

    el.innerHTML = `
      <div class="drag-handle" title="拖动排序">⋮⋮</div>
      <div class="prompt-icon">${p.icon || '💡'}</div>
      <div class="prompt-info">
        <div class="prompt-name">${escapeHtml(p.name)}</div>
        <div class="prompt-preview">${escapeHtml(p.content)}</div>
      </div>
      <div class="prompt-item-actions">
        <span class="delete-prompt-btn" title="删除">&times;</span>
      </div>
    `;
    list.appendChild(el);
  });
}

function createPrompt() {
  state.editingPromptId = 'new-' + Date.now();

  // Clear form
  els.editorTitle.textContent = '新建提示词';
  els.editPromptName.value = '';
  els.editPromptContent.value = '';
  els.editPromptIconDisplay.textContent = '💡';

  // Clear errors
  els.editPromptName.classList.remove('error');
  els.editPromptContent.classList.remove('error');

  // Slide in editor
  els.promptEditor.classList.remove('hidden');

  // Force reflow to ensure transition plays
  void els.promptEditor.offsetWidth;

  els.promptEditor.classList.add('active');

  // Accessibility: Trap focus in editor
  if (els.promptsListView) els.promptsListView.inert = true;

  els.editPromptName.focus();
}

function editPrompt(index) {
  // If we are filtering, the index matches the filtered list. 
  // We need to find the real item.
  // Actually, we stored dataset.id on the element.
  const id = els.promptsList.children[index]?.dataset.id;
  if (!id) return;

  const prompt = state.prompts.find(p => p.id === id);
  if (!prompt) return;

  state.editingPromptId = id;

  els.editorTitle.textContent = '编辑提示词';
  els.editPromptName.value = prompt.name;
  els.editPromptContent.value = prompt.content;
  els.editPromptIconDisplay.textContent = prompt.icon || '💡';

  // Clear errors
  els.editPromptName.classList.remove('error');
  els.editPromptContent.classList.remove('error');

  // Slide in editor
  els.promptEditor.classList.remove('hidden');

  // Force reflow
  void els.promptEditor.offsetWidth;

  els.promptEditor.classList.add('active');

  // Accessibility: Trap focus in editor
  if (els.promptsListView) els.promptsListView.inert = true;
}

function closeEditor() {
  els.promptEditor.classList.remove('active');

  // Accessibility: Restore focus to list
  if (els.promptsListView) els.promptsListView.inert = false;

  // Wait for transition to finish before hiding (300ms matches CSS)
  setTimeout(() => {
    els.promptEditor.classList.add('hidden');
    // Ensure list is visible (though we never hid it in this new logic, keeping for safety)
    els.promptsListView.classList.remove('hidden');
  }, 300);

  state.editingPromptId = null;
}

async function savePrompt() {
  const nameInput = els.editPromptName;
  const contentInput = els.editPromptContent;
  const name = nameInput.value.trim();
  const content = contentInput.value.trim();
  const icon = els.editPromptIconDisplay.textContent;

  let hasError = false;
  if (!name) {
    nameInput.classList.add('error');
    hasError = true;
  } else {
    nameInput.classList.remove('error');
  }

  if (!content) {
    contentInput.classList.add('error');
    hasError = true;
  } else {
    contentInput.classList.remove('error');
  }

  if (hasError) return;

  const newPrompt = {
    id: state.editingPromptId.startsWith('new-') ? (Date.now() + '-' + Math.random().toString(36).substr(2, 9)) : state.editingPromptId,
    name,
    content,
    icon
  };

  if (state.editingPromptId.startsWith('new-')) {
    state.prompts.push(newPrompt);
  } else {
    const idx = state.prompts.findIndex(p => p.id === state.editingPromptId);
    if (idx !== -1) {
      state.prompts[idx] = newPrompt;
    }
  }

  await storage.set({ savedPrompts: state.prompts });

  closeEditor();

  renderPrompts(els.promptSearch.value);
}

async function deletePrompt(e, index) {
  e.stopPropagation();
  if (!confirm('确定要删除这个提示词吗？')) return;

  const id = els.promptsList.children[index]?.dataset.id;
  if (!id) return;

  state.prompts = state.prompts.filter(p => p.id !== id);
  await storage.set({ savedPrompts: state.prompts });

  if (state.editingPromptId === id) {
    closeEditor();
  }

  renderPrompts(els.promptSearch.value);
}

// --- Drag and Drop ---
let draggedItemIndex = null;

function handleDragStart(e) {
  const item = e.target.closest('.prompt-item');
  if (!item || els.promptSearch.value) { // Disable drag if filtering
    e.preventDefault();
    return;
  }
  draggedItemIndex = parseInt(item.dataset.index);
  e.dataTransfer.effectAllowed = 'move';
  item.classList.add('dragging');
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const item = e.target.closest('.prompt-item');
  if (!item) return;

  const list = els.promptsList;
  const items = [...list.querySelectorAll('.prompt-item')];
  const overIndex = items.indexOf(item);

  if (overIndex !== draggedItemIndex) {
    // Visual feedback could be added here (placeholder)
  }
}

function handleDrop(e) {
  e.preventDefault();
  const item = e.target.closest('.prompt-item');
  if (!item) return;

  const fromIndex = draggedItemIndex;
  const toIndex = parseInt(item.dataset.index);

  if (fromIndex !== null && fromIndex !== toIndex) {
    // Move in array
    const movedItem = state.prompts.splice(fromIndex, 1)[0];
    state.prompts.splice(toIndex, 0, movedItem);

    // Save
    storage.set({ savedPrompts: state.prompts });
    renderPrompts();
  }
}

function handleDragEnd(e) {
  const item = e.target.closest('.prompt-item');
  if (item) item.classList.remove('dragging');
  draggedItemIndex = null;
}

// --- Emoji Picker ---

function toggleEmojiPicker() {
  if (els.emojiPicker.classList.contains('hidden')) {
    renderEmojiGrid();
    els.emojiPicker.classList.remove('hidden');
    els.emojiSearch.value = '';
    els.emojiSearch.focus();
  } else {
    els.emojiPicker.classList.add('hidden');
  }
}

function renderEmojiGrid(filter = '') {
  const grid = els.emojiGrid;
  grid.innerHTML = '';

  const filtered = COMMON_EMOJIS.filter(e => !filter || e.includes(filter)); // Simple filter, emojis usually don't have text names in this list. 
  // Ideally we map emojis to keywords. For now, show all if no filter or just matching emojis.

  filtered.forEach(emoji => {
    const div = document.createElement('div');
    div.className = 'emoji-item';
    div.textContent = emoji;
    div.onclick = (e) => {
      e.stopPropagation();
      els.editPromptIconDisplay.textContent = emoji;
      els.emojiPicker.classList.add('hidden');
    };
    grid.appendChild(div);
  });
}

// --- Slash Command ---

function handleSlashCommandInput() {
  const val = els.userInput.value;

  // Check if we just typed "/" at start or after newline
  // For simplicity, let's just support "/" at start for now, or use a regex
  // Regex: /(?:^|\n)\/(\S*)$/
  const match = /(?:^|\n)\/([^ \n]*)$/.exec(val);

  if (match) {
    const query = match[1];
    state.slashCommandActive = true;
    state.slashCommandQuery = query;
    renderSlashPopup(query);
  } else {
    closeSlashPopup();
  }
}

function renderSlashPopup(query) {
  const popup = els.slashPopup;
  const q = query.toLowerCase();

  const matches = state.prompts.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.content.toLowerCase().includes(q)
  );

  if (matches.length === 0) {
    closeSlashPopup();
    return;
  }

  popup.innerHTML = matches.map((p, i) => `
    <div class="slash-item ${i === 0 ? 'active' : ''}" data-index="${i}" data-id="${p.id}">
      <div class="slash-item-icon">${p.icon}</div>
      <div class="slash-item-name">${escapeHtml(p.name)}</div>
      <div class="slash-item-preview">${escapeHtml(p.content)}</div>
    </div>
  `).join('');

  // Add click listeners
  const items = popup.querySelectorAll('.slash-item');
  items.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      applySlashCommand(item.dataset.id);
    });
    // Optional: update selection on hover
    item.addEventListener('mouseenter', () => {
      state.slashCommandIndex = parseInt(item.dataset.index);
      updateSlashSelection(items);
    });
  });

  state.slashCommandIndex = 0;
  popup.classList.remove('hidden');

  // Position popup? It is absolute bottom 80px, fixed for now.
}

function closeSlashPopup() {
  state.slashCommandActive = false;
  els.slashPopup.classList.add('hidden');
}

function handleSlashCommandKeydown(e) {
  const popup = els.slashPopup;
  if (popup.classList.contains('hidden')) return;

  const items = popup.querySelectorAll('.slash-item');
  if (items.length === 0) return;

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    state.slashCommandIndex = (state.slashCommandIndex - 1 + items.length) % items.length;
    updateSlashSelection(items);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    state.slashCommandIndex = (state.slashCommandIndex + 1) % items.length;
    updateSlashSelection(items);
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    const selected = items[state.slashCommandIndex];
    if (selected) {
      applySlashCommand(selected.dataset.id);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeSlashPopup();
  }
}

function updateSlashSelection(items) {
  items.forEach((item, i) => {
    if (i === state.slashCommandIndex) item.classList.add('active');
    else item.classList.remove('active');
  });
}

function applySlashCommand(id) {
  const prompt = state.prompts.find(p => String(p.id) === String(id));
  if (!prompt) return;

  // Replace the slash command with prompt content
  const val = els.userInput.value;
  const match = /(?:^|\n)\/([^ \n]*)$/.exec(val);

  if (match) {
    const prefix = val.slice(0, match.index);
    // If matched at newline, preserve newline
    const separator = match.index === 0 ? '' : '\n';
    els.userInput.value = prefix + separator + prompt.content;

    closeSlashPopup();
    resizeTextarea();
    updateSendButton();
    els.userInput.focus();
  }
}

// Expose to global scope for HTML onclick
// window.selectPrompt = selectPrompt; 
// window.deletePrompt = deletePrompt;

// Start
// Use DOMContentLoaded to ensure elements are ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
