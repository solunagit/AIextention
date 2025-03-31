if (typeof window.pageAssistState === 'undefined') {
  window.pageAssistState = {
  sidebarVisible: false,
  sidebarElement: null,
  isResizing: false,
  lastDownX: 0,
  initialWidth: 0,
  chatHistory: []
};
}

function loadChatHistory() {
  try {
    const history = localStorage.getItem('pageAssistChatHistory');
    window.pageAssistState.chatHistory = history ? JSON.parse(history) : [];
  } catch (error) {
    console.error('Error loading chat history:', error);
    window.pageAssistState.chatHistory = [];
  }
}

function saveChatHistory() {
  try {
    localStorage.setItem('pageAssistChatHistory', JSON.stringify(window.pageAssistState.chatHistory));
  } catch (error) {
    console.error('Error saving chat history:', error);
  }
}

function addToChatHistory(question, answer) {
  window.pageAssistState.chatHistory.push({ question, answer, timestamp: new Date().toISOString() });
  if (window.pageAssistState.chatHistory.length > 50) {
    window.pageAssistState.chatHistory.shift();
  }
  saveChatHistory();
}

function displayChatHistory(element) {
  if (window.pageAssistState.chatHistory.length === 0) {
  element.innerHTML = `
    <div class="chat-history">
        <div class="no-history" style="text-align: center; padding: 20px;">
          <p>No chat history yet.</p>
          <p style="color: var(--text-muted); font-size: 0.9em; margin-top: 10px;">
            Try summarizing the page or asking a question to get started.
          </p>
      </div>
    </div>
  `;
    return;
  }

  const historyHTML = window.pageAssistState.chatHistory.map(chat => `
    <div class="chat-exchange">
      <div class="user-question">
        <strong>Your question:</strong>
        <p>${chat.question}</p>
        <small class="timestamp">${new Date(chat.timestamp).toLocaleString()}</small>
    </div>
      <div class="ai-response">
        <strong>Answer:</strong>
        <p>${chat.answer}</p>
    </div>
    </div>
  `).join('');

  element.innerHTML = `
    <div class="chat-history">
      <div class="history-content">
        ${historyHTML}
      </div>
    </div>
  `;

  const historyContent = element.querySelector('.history-content');
  if (historyContent) {
    historyContent.scrollTop = historyContent.scrollHeight;
}
}

async function createSidebar() {
  const cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet';
  cssLink.href = chrome.runtime.getURL('sidebar.css');
  document.head.appendChild(cssLink);

  const sidebar = document.createElement('div');
  sidebar.id = 'ai-sidebar';

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  resizeHandle.style.cssText = `
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    cursor: ew-resize;
    background-color: transparent;
    transition: background-color 0.3s;
`;

  resizeHandle.addEventListener('mouseenter', () => {
    resizeHandle.style.backgroundColor = '#4a4a4a';
  });
  resizeHandle.addEventListener('mouseleave', () => {
    if (!window.pageAssistState.isResizing) {
      resizeHandle.style.backgroundColor = 'transparent';
    }
  });

  sidebar.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    transform: translateX(100%);
    transition: transform 0.3s ease;
    height: 100vh;
    width: 25vw;
    min-width: 200px;
    max-width: 800px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;

  const htmlUrl = chrome.runtime.getURL('sidebar.html');
  const response = await fetch(htmlUrl);
  let html = await response.text();

  html = html.replace(
    `<div class="window-controls">
      <button id="close-sidebar" class="control-btn">×</button>
    </div>`,
    `<div class="window-controls">
      <button id="clear-history" class="clear-history-btn">Clear History</button>
      <button id="close-sidebar" class="control-btn">×</button>
    </div>`
  );

  html = html.replace(
    `<button id="history-button" class="action-btn">
      <span class="icon">📚</span>
      View History
    </button>`,
    ''
  );

  sidebar.innerHTML = html;
  sidebar.insertBefore(resizeHandle, sidebar.firstChild);
  document.body.appendChild(sidebar);
  window.pageAssistState.sidebarElement = sidebar;
  setupEventListeners();
  setupResizeListeners(resizeHandle, sidebar);
  return sidebar;
  }

function setupResizeListeners(resizeHandle, sidebar) {
  resizeHandle.addEventListener('mousedown', initResize);

  function initResize(e) {
    window.pageAssistState.isResizing = true;
    window.pageAssistState.lastDownX = e.clientX;
    window.pageAssistState.initialWidth = parseInt(getComputedStyle(sidebar).width, 10);

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10000;
      cursor: ew-resize;
    `;
    overlay.id = 'resize-overlay';
    document.body.appendChild(overlay);

    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);

    resizeHandle.style.backgroundColor = '#4a4a4a';
  }

  function resize(e) {
    if (!window.pageAssistState.isResizing) return;

    const delta = window.pageAssistState.lastDownX - e.clientX;
    const newWidth = Math.min(Math.max(window.pageAssistState.initialWidth + delta, 200), 800);

    sidebar.style.width = `${newWidth}px`;
    document.body.style.marginRight = `${newWidth}px`;
  }

  function stopResize() {
    window.pageAssistState.isResizing = false;
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', stopResize);

    const overlay = document.getElementById('resize-overlay');
    if (overlay) {
      overlay.remove();
    }

    resizeHandle.style.backgroundColor = 'transparent';
  }
}

function setupEventListeners() {
  document.getElementById('close-sidebar').addEventListener('click', () => toggleSidebar());
  document.getElementById('summarize-button').addEventListener('click', analyzePage);
  document.getElementById('suggest-button').addEventListener('click', suggestQuestions);
  document.getElementById('send-button').addEventListener('click', handleChatSubmit);
  document.getElementById('clear-history').addEventListener('click', clearHistory);

  const chatInput = document.getElementById('chat-input');
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit();
    }
});

  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = chatInput.scrollHeight + 'px';
  });

  loadChatHistory();
  const sidebarContent = document.getElementById('sidebar-content');
  displayChatHistory(sidebarContent);
}

function clearHistory() {
  if (confirm('Are you sure you want to clear all chat history?')) {
    window.pageAssistState.chatHistory = [];
    saveChatHistory();
    const sidebarContent = document.getElementById('sidebar-content');
    displayChatHistory(sidebarContent);
  }
}

async function handleChatSubmit() {
  const chatInput = document.getElementById('chat-input');
  const question = chatInput.value.trim();

  if (!question) return;

  const sidebarContent = document.getElementById('sidebar-content');
  showLoading(sidebarContent);

  try {
    const pageContent = document.body.innerText.slice(0, 5000);

    chrome.runtime.sendMessage({
      action: "analyzeContent",
      content: pageContent,
      prompt: question
    }, response => {
      if (response && response.success) {
        addToChatHistory(question, response.data);
        displayChatHistory(sidebarContent);
      } else {
        showError(sidebarContent, response?.error || 'Failed to process question');
      }
    });
  } catch (error) {
    showError(sidebarContent, error.message);
  }
  chatInput.value = '';
  chatInput.style.height = 'auto';
}

async function toggleSidebar() {
  const sidebar = window.pageAssistState.sidebarElement || await createSidebar();
  const currentWidth = parseInt(getComputedStyle(sidebar).width, 10);

  if (window.pageAssistState.sidebarVisible) {
    sidebar.style.transform = 'translateX(100%)';
    document.body.style.marginRight = '0';
  } else {
    sidebar.style.transform = 'translateX(0%)';
    document.body.style.marginRight = `${currentWidth}px`;
  }

  window.pageAssistState.sidebarVisible = !window.pageAssistState.sidebarVisible;
}

async function analyzePage() {
  const sidebarContent = document.getElementById('sidebar-content');
  showLoading(sidebarContent);
  const summaryPrompt = "Please provide a clear and concise summary of this page";

  try {
    const pageContent = document.body.innerText.slice(0, 5000);

    chrome.runtime.sendMessage({
      action: "analyzeContent",
      content: pageContent,
      prompt: summaryPrompt
    }, response => {
      if (response && response.success) {
        addToChatHistory(summaryPrompt, response.data);
        displayChatHistory(sidebarContent);
      } else {
        showError(sidebarContent, response?.error || 'Failed to analyze page');
      }
    });
  } catch (error) {
    showError(sidebarContent, error.message);
  }
}

async function suggestQuestions() {
  const sidebarContent = document.getElementById('sidebar-content');
  showLoading(sidebarContent);
  const questionPrompt = "Suggest 3-5 relevant questions about this content that a reader might want to ask";

  try {
    const pageContent = document.body.innerText.slice(0, 5000);

    chrome.runtime.sendMessage({
      action: "analyzeContent",
      content: pageContent,
      prompt: questionPrompt
    }, response => {
      if (response && response.success) {
        addToChatHistory(questionPrompt, response.data);
        displayChatHistory(sidebarContent);
      } else {
        showError(sidebarContent, response?.error || 'Failed to suggest questions');
      }
    });
  } catch (error) {
    showError(sidebarContent, error.message);
  }
}

function showLoading(element) {
  element.innerHTML = `
    <div class="loading">
      <p>Processing...</p>
      <div class="loading-spinner"></div>
    </div>
  `;
}

function showError(element, message) {
  element.innerHTML = `
    <div class="error">
      <p>Error: ${message}</p>
    </div>
  `;
}

const style = document.createElement('style');
style.textContent = `
  .resize-handle:hover {
    background-color: #4a4a4a !important;
  }

  #ai-sidebar {
    resize: horizontal;
    overflow: auto;
  }
`;
document.head.appendChild(style);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleSidebar") {
    toggleSidebar();
  }
});
