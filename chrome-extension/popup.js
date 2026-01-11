// Schedule AI Focus - Popup Script

// i18n 헬퍼 함수
function getMessage(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

// i18n 초기화 - data-i18n 속성을 가진 요소들의 텍스트를 번역
function initI18n() {
  // 텍스트 콘텐츠 번역
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = getMessage(key);
  });

  // placeholder 번역
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = getMessage(key);
  });

  // title 번역
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.title = getMessage(key);
  });
}

// 기본 차단 URL 목록
const DEFAULT_BLOCKED_URLS = [
  { pattern: 'youtube.com', name: 'YouTube', enabled: true },
  { pattern: 'facebook.com', name: 'Facebook', enabled: true },
  { pattern: 'instagram.com', name: 'Instagram', enabled: true },
  { pattern: 'twitter.com', name: 'Twitter/X', enabled: true },
  { pattern: 'x.com', name: 'X', enabled: true },
  { pattern: 'linkedin.com', name: 'LinkedIn', enabled: false },
  { pattern: 'reddit.com', name: 'Reddit', enabled: true },
  { pattern: 'mail.google.com', name: 'Gmail', enabled: false },
  { pattern: 'tiktok.com', name: 'TikTok', enabled: true },
];

// 상태
let state = {
  isActive: false,
  blockedUrls: [],
  elapsedSeconds: 0,
  timerSeconds: 0,
  timerType: 'none'
};

let savedUrls = [];

// 버튼 클릭 후 상태 업데이트 무시 시간 (레이스 컨디션 방지)
let ignoreStateUpdatesUntil = 0;
const STATE_UPDATE_COOLDOWN_MS = 1500;

// DOM 요소
const elements = {
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  timer: document.getElementById('timer'),
  timerLabel: document.getElementById('timer-label'),
  toggleBtn: document.getElementById('toggle-btn'),
  toggleText: document.getElementById('toggle-text'),
  urlList: document.getElementById('url-list'),
  addUrlBtn: document.getElementById('add-url-btn'),
  addUrlForm: document.getElementById('add-url-form'),
  newUrlInput: document.getElementById('new-url-input'),
  newUrlName: document.getElementById('new-url-name'),
  cancelAddBtn: document.getElementById('cancel-add-btn'),
  confirmAddBtn: document.getElementById('confirm-add-btn'),
  errorMessage: document.getElementById('error-message')
};

// 시간 포맷팅
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

let isDesktopConnected = false;

// 연결 상태 업데이트
function updateConnectionStatus(connected) {
  isDesktopConnected = connected;
  if (connected) {
    elements.statusDot.className = 'connected';
    elements.statusText.textContent = getMessage('statusConnected');
  } else {
    elements.statusDot.className = 'disconnected';
    elements.statusText.textContent = getMessage('statusStandalone');
  }
  // 연결 여부와 관계없이 버튼은 항상 활성화
  elements.toggleBtn.disabled = false;
}

// UI 업데이트
function updateUI() {
  // 타이머 표시
  if (state.timerType !== 'none' && state.timerSeconds > 0) {
    elements.timer.textContent = formatTime(state.timerSeconds);
    elements.timerLabel.textContent = state.timerType === 'pomodoro' ? getMessage('timerFocusTime') : getMessage('timerGeneral');
  } else {
    elements.timer.textContent = formatTime(state.elapsedSeconds);
    elements.timerLabel.textContent = state.isActive ? getMessage('timerElapsed') : '';
  }

  // 토글 버튼
  if (state.isActive) {
    elements.toggleBtn.classList.add('active');
    elements.toggleText.textContent = getMessage('focusModeStop');
  } else {
    elements.toggleBtn.classList.remove('active');
    elements.toggleText.textContent = getMessage('focusModeStart');
  }
}

// URL 목록 렌더링
function renderUrlList() {
  elements.urlList.innerHTML = '';

  savedUrls.forEach((url, index) => {
    const item = document.createElement('div');
    item.className = 'url-item';
    item.innerHTML = `
      <input type="checkbox" class="url-checkbox" data-index="${index}" ${url.enabled ? 'checked' : ''}>
      <div class="url-info">
        <div class="url-name">${url.name}</div>
        <div class="url-pattern">${url.pattern}</div>
      </div>
      <button class="url-delete" data-index="${index}" title="${getMessage('delete')}">&times;</button>
    `;
    elements.urlList.appendChild(item);
  });

  // 체크박스 이벤트
  elements.urlList.querySelectorAll('.url-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const index = parseInt(e.target.dataset.index);
      savedUrls[index].enabled = e.target.checked;
      saveUrls();
      syncBlockedUrls();
    });
  });

  // 삭제 버튼 이벤트
  elements.urlList.querySelectorAll('.url-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      savedUrls.splice(index, 1);
      saveUrls();
      renderUrlList();
      syncBlockedUrls();
    });
  });
}

// URL 저장
function saveUrls() {
  chrome.storage.local.set({ blockedUrls: savedUrls });
}

// URL 로드
async function loadUrls() {
  const result = await chrome.storage.local.get('blockedUrls');
  savedUrls = result.blockedUrls || DEFAULT_BLOCKED_URLS;
  renderUrlList();
}

// 차단 URL 동기화 (background에 전송)
function syncBlockedUrls() {
  const enabledUrls = savedUrls.filter(u => u.enabled).map(u => u.pattern);
  chrome.runtime.sendMessage({
    type: 'UPDATE_BLOCKED_URLS',
    blockedUrls: enabledUrls
  });
}

// 상태 가져오기
async function fetchState() {
  // 버튼 클릭 후 쿨다운 중이면 상태 업데이트 무시
  if (Date.now() < ignoreStateUpdatesUntil) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (response) {
      state = response;
      updateUI();
    }
  } catch (err) {
    console.error('Failed to get state:', err);
  }
}

// 연결 상태 확인
async function checkConnection() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CONNECTION_STATUS' });
    updateConnectionStatus(response?.connected || false);
  } catch {
    updateConnectionStatus(false);
  }
}

// Focus Mode 토글
let isToggling = false;
function toggleFocus() {
  // 더블클릭 방지
  if (isToggling) {
    console.log('Toggle already in progress, ignoring');
    return;
  }
  isToggling = true;
  setTimeout(() => { isToggling = false; }, 2000); // 2초 후 해제

  // 버튼 클릭 시 즉시 상태 반전 및 상태 업데이트 무시 시간 설정
  ignoreStateUpdatesUntil = Date.now() + STATE_UPDATE_COOLDOWN_MS;

  console.log('toggleFocus called, current state.isActive:', state.isActive);

  if (state.isActive) {
    // 즉시 로컬 상태 업데이트 (낙관적 업데이트)
    state.isActive = false;
    updateUI();
    console.log('Sending STOP_FOCUS');
    chrome.runtime.sendMessage({ type: 'STOP_FOCUS' });
  } else {
    // 즉시 로컬 상태 업데이트 (낙관적 업데이트)
    state.isActive = true;
    updateUI();
    const enabledUrls = savedUrls.filter(u => u.enabled).map(u => u.pattern);
    console.log('Sending START_FOCUS');
    chrome.runtime.sendMessage({
      type: 'START_FOCUS',
      blockedUrls: enabledUrls,
      timerType: 'none',
      timerDuration: 0
    });
  }
}

// URL 추가 폼 표시/숨김
function showAddForm() {
  elements.addUrlForm.classList.remove('hidden');
  elements.newUrlInput.focus();
}

function hideAddForm() {
  elements.addUrlForm.classList.add('hidden');
  elements.newUrlInput.value = '';
  elements.newUrlName.value = '';
}

// URL 추가
function addUrl() {
  const pattern = elements.newUrlInput.value.trim();
  const name = elements.newUrlName.value.trim() || pattern;

  if (!pattern) {
    showError(getMessage('errorEnterUrl'));
    return;
  }

  // 중복 체크
  if (savedUrls.some(u => u.pattern === pattern)) {
    showError(getMessage('errorDuplicate'));
    return;
  }

  savedUrls.push({ pattern, name, enabled: true });
  saveUrls();
  renderUrlList();
  syncBlockedUrls();
  hideAddForm();
}

// 에러 표시
function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorMessage.classList.remove('hidden');
  setTimeout(() => {
    elements.errorMessage.classList.add('hidden');
  }, 3000);
}

// 이벤트 리스너
elements.toggleBtn.addEventListener('click', toggleFocus);
elements.addUrlBtn.addEventListener('click', showAddForm);
elements.cancelAddBtn.addEventListener('click', hideAddForm);
elements.confirmAddBtn.addEventListener('click', addUrl);

elements.newUrlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addUrl();
  }
});

// background에서 상태 업데이트 수신
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATE_UPDATE') {
    // 버튼 클릭 후 쿨다운 중이면 상태 업데이트 무시
    if (Date.now() < ignoreStateUpdatesUntil) {
      return;
    }
    state = message.payload;
    updateUI();
  }
});

// 초기화
async function init() {
  // i18n 초기화
  initI18n();

  await loadUrls();
  await fetchState();
  await checkConnection();

  // 주기적으로 상태 업데이트
  setInterval(fetchState, 1000);
  setInterval(checkConnection, 5000);
}

init();
