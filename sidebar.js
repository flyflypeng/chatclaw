
/**
 * MicroClaw Sidebar Logic
 * Handles SSE connection, chat UI, and settings.
 */

const DEFAULT_GATEWAY = 'http://localhost:18789';
const ENDPOINTS = {
  CHAT: '/api/message',
  CHECK: '/api/status'
};

// State
let state = {
  gatewayUrl: DEFAULT_GATEWAY,
  apiToken: '',
  connected: false,
  pageContext: null,
  attachment: null,
  prompts: []
};

// DOM Elements
const els = {
  statusIndicator: document.getElementById('connection-status'),
  chatContainer: document.getElementById('chat-container'),
  userInput: document.getElementById('user-input'),
  sendBtn: document.getElementById('send-btn'),
  settingsBtn: document.getElementById('settings-btn'),
  settingsModal: document.getElementById('settings-modal'),
  closeSettingsBtn: document.getElementById('close-settings'),
  saveSettingsBtn: document.getElementById('save-settings'),
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
  addPromptBtn: document.getElementById('add-prompt-btn')
};

// --- Initialization ---

async function init() {
  await loadSettings();
  setupEventListeners();
  checkConnection();
  
  // Auto-focus input
  els.userInput.focus();
}

async function loadSettings() {
  const result = await chrome.storage.local.get(['gatewayUrl', 'apiToken']);
  state.gatewayUrl = normalizeUrl(result.gatewayUrl || DEFAULT_GATEWAY);
  state.apiToken = result.apiToken || '';
  
  // Update UI
  els.gatewayInput.value = state.gatewayUrl;
  els.tokenInput.value = state.apiToken;
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
    els.newPromptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addPrompt();
    });
  }

  // Settings
  els.settingsBtn.addEventListener('click', () => {
    els.settingsModal.classList.remove('hidden');
    checkConnection(); // Re-check when opening settings
  });

  els.closeSettingsBtn.addEventListener('click', () => {
    els.settingsModal.classList.add('hidden');
  });

  els.saveSettingsBtn.addEventListener('click', async () => {
    const url = normalizeUrl(els.gatewayInput.value);
    const token = els.tokenInput.value.trim();
    
    await chrome.storage.local.set({ gatewayUrl: url, apiToken: token });
    state.gatewayUrl = url;
    state.apiToken = token;
    
    const connected = await checkConnection();
    if (connected) {
      setTimeout(() => els.settingsModal.classList.add('hidden'), 500);
    }
  });
}

// --- Connection Logic ---

function normalizeUrl(url) {
  let trimmed = url.trim();
  if (!trimmed) return DEFAULT_GATEWAY;
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'http://' + trimmed;
  }
  return trimmed.replace(/\/+$/, '');
}

async function checkConnection() {
  els.settingsStatus.textContent = 'Checking...';
  els.settingsStatus.style.color = 'var(--text-secondary)';
  
  try {
    const response = await fetch(`${state.gatewayUrl}${ENDPOINTS.CHECK}`, {
      headers: getHeaders()
    });
    
    if (response.ok) {
      updateConnectionStatus(true);
      els.settingsStatus.textContent = 'Connected ✅';
      els.settingsStatus.style.color = 'var(--success-color)';
      return true;
    } else {
      throw new Error(`Status: ${response.status}`);
    }
  } catch (err) {
    console.error('Connection failed:', err);
    updateConnectionStatus(false);
    els.settingsStatus.textContent = `Connection failed: ${err.message} ❌`;
    els.settingsStatus.style.color = 'var(--error-color)';
    return false;
  }
}

function updateConnectionStatus(connected) {
  state.connected = connected;
  if (connected) {
    els.statusIndicator.classList.remove('disconnected');
    els.statusIndicator.classList.add('connected');
    els.statusIndicator.title = 'Connected';
  } else {
    els.statusIndicator.classList.remove('connected');
    els.statusIndicator.classList.add('disconnected');
    els.statusIndicator.title = 'Disconnected';
  }
}

function getHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (state.apiToken) {
    headers['Authorization'] = `Bearer ${state.apiToken}`;
  }
  return headers;
}

// --- Chat Logic ---

async function togglePageContext() {
  if (state.pageContext) {
    state.pageContext = null;
    els.addUrlBtn.classList.remove('active');
    els.addUrlBtn.title = "Add Page Context";
  } else {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        // Try to get full context from content script
        try {
          const response = await chrome.tabs.sendMessage(tabs[0].id, { type: 'collect-basic-context' });
          if (response && response.context) {
             state.pageContext = response.context;
          } else {
             throw new Error('No context');
          }
        } catch (e) {
          // Fallback to basic tab info (e.g. if content script not loaded)
          state.pageContext = {
            url: tabs[0].url,
            title: tabs[0].title
          };
        }
        
        els.addUrlBtn.classList.add('active');
        els.addUrlBtn.title = `Context: ${state.pageContext.title.slice(0, 20)}...`;
      }
    } catch (err) {
      console.error('Failed to get tab info:', err);
    }
  }
}

async function sendMessage() {
  const text = els.userInput.value.trim();
  if (!text) return;

  // Clear input
  els.userInput.value = '';
  resizeTextarea();
  updateSendButton();

  // Add User Message
  addMessage('user', text);

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
    els.attachBtn.title = "Attach file";
  }

  // Add Agent Placeholder
  const agentMsgId = addMessage('agent', '');
  const agentBubble = document.getElementById(agentMsgId).querySelector('.message-bubble');
  
  // Show loading state
  agentBubble.innerHTML = '<span class="typing-dots">...</span>';

  try {
    await streamResponse(payload, agentBubble);
  } catch (err) {
    agentBubble.textContent = `Error: ${err.message}`;
    agentBubble.style.color = 'var(--error-color)';
  }
}

async function streamResponse(payload, targetElement) {
  let accumulatedText = '';
  
  try {
    const response = await fetch(`${state.gatewayUrl}${ENDPOINTS.CHAT}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Clear loading indicator
    targetElement.textContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop(); // Keep incomplete chunk

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6);
          try {
            const data = JSON.parse(jsonStr);
            
            if (data.type === 'content') {
              accumulatedText += data.content;
              renderMarkdown(targetElement, accumulatedText);
            } else if (data.type === 'error') {
               accumulatedText += `\n*[Error: ${data.message}]*`;
               renderMarkdown(targetElement, accumulatedText);
            }
          } catch (e) {
            console.warn('Failed to parse SSE data:', e);
          }
        }
      }
      
      scrollToBottom();
    }
  } catch (err) {
    throw err;
  }
}

// --- UI Helpers ---

function addMessage(role, content) {
  const id = `msg-${Date.now()}`;
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.id = id;
  div.innerHTML = `
    <div class="message-bubble">${escapeHtml(content)}</div>
    <div class="message-meta">${new Date().toLocaleTimeString()}</div>
  `;
  
  els.chatContainer.appendChild(div);
  scrollToBottom();
  
  // Remove welcome message if present
  const welcome = els.chatContainer.querySelector('.welcome-message');
  if (welcome) welcome.remove();

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
    els.attachBtn.title = `Attached: ${file.name}`;
    
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

async function openPrompts() {
  const res = await chrome.storage.local.get(['savedPrompts']);
  state.prompts = res.savedPrompts || [];
  renderPrompts();
  els.promptsModal.classList.remove('hidden');
}

function renderPrompts() {
  els.promptsList.innerHTML = state.prompts.map((p, i) => `
    <div class="prompt-item" onclick="selectPrompt(${i})">
      <span class="prompt-text">${escapeHtml(p)}</span>
      <span class="delete-prompt-btn" onclick="deletePrompt(event, ${i})">&times;</span>
    </div>
  `).join('');
}

async function addPrompt() {
  const text = els.newPromptInput.value.trim();
  if (!text) return;

  state.prompts.push(text);
  await chrome.storage.local.set({ savedPrompts: state.prompts });
  
  els.newPromptInput.value = '';
  renderPrompts();
}

async function deletePrompt(e, index) {
  e.stopPropagation();
  state.prompts.splice(index, 1);
  await chrome.storage.local.set({ savedPrompts: state.prompts });
  renderPrompts();
}

// Expose to global scope for HTML onclick
window.selectPrompt = (index) => {
  const text = state.prompts[index];
  if (text) {
    els.userInput.value = text;
    resizeTextarea();
    updateSendButton();
    els.promptsModal.classList.add('hidden');
    els.userInput.focus();
  }
};

window.deletePrompt = deletePrompt;

// Start
init();
