// Schedule AI Focus - Background Service Worker
// Native Messaging을 통해 데스크톱 앱과 통신하여 Focus Mode 상태 동기화
// 데스크톱 앱이 없어도 단독으로 동작 가능

const NATIVE_HOST_NAME = 'com.scheduleai.host';

// 상태
let focusState = {
  isActive: false,
  blockedUrls: [],
  elapsedSeconds: 0,
  timerSeconds: 0,
  timerType: 'none' // 'none' | 'timer' | 'pomodoro'
};

let nativePort = null;
let nativePortId = 0; // 포트 식별용 ID
let isDesktopConnected = false;
let isPortReady = false; // CONNECTED 응답을 받은 후에만 true
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;

// 서비스 워커 인스턴스 ID (디버깅용)
const SW_INSTANCE_ID = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
console.log('Service Worker instance:', SW_INSTANCE_ID);

// 연결 확인 후 보낼 대기 메시지 큐
let pendingMessages = [];

// Chrome에서 Focus 제어 중인지 구분 (데스크톱에서 온 상태 업데이트 무시용)
let pendingFocusStart = false;
let pendingFocusStop = false;
let lastCommandTime = 0;
const COMMAND_COOLDOWN_MS = 2000; // 2초 동안 중복 명령 방지

// 단독 모드용 타이머
let standaloneTimer = null;
let standaloneStartTime = null;

// 사이트 이름 추출
function getSiteName(url) {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.replace('www.', '').split('.');
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  } catch {
    return 'Unknown';
  }
}

// URL이 차단 대상인지 확인
function shouldBlock(url) {
  if (!url || !focusState.isActive || focusState.blockedUrls.length === 0) {
    return false;
  }
  return focusState.blockedUrls.some(pattern => url.includes(pattern));
}

// Chrome 알림 표시
function showBlockedNotification(url) {
  const siteName = getSiteName(url);
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: chrome.i18n.getMessage('notificationTitle'),
    message: chrome.i18n.getMessage('notificationTabClosed', [siteName]),
    priority: 1
  });
}

// 모든 탭 검사 및 차단
async function checkAndCloseTabs() {
  if (!focusState.isActive) return;

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url && shouldBlock(tab.url)) {
      try {
        await chrome.tabs.remove(tab.id);
        showBlockedNotification(tab.url);
      } catch (err) {
        console.error('Failed to close tab:', err);
      }
    }
  }
}

// Native Host 연결
let isConnecting = false; // 연결 중인지 확인

function connectToNativeHost(forceReconnect = false) {
  // 이미 연결 시도 중이면 스킵
  if (isConnecting) {
    console.log('Already connecting to native host, skipping');
    return;
  }

  // 강제 재연결이 아니고, 포트가 있고, 준비 완료 상태면 스킵
  if (!forceReconnect && nativePort && isPortReady) {
    console.log('Native host already connected and ready, skipping');
    return;
  }

  // 기존 포트 정리
  if (nativePort) {
    try {
      nativePort.disconnect();
    } catch (e) {
      // 이미 끊어진 경우 무시
    }
    nativePort = null;
  }
  isPortReady = false;

  isConnecting = true;

  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);

    nativePort.onMessage.addListener((message) => {
      console.log('Received from native host:', message);
      handleNativeMessage(message);
    });

    nativePort.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError?.message;
      console.log(`[${SW_INSTANCE_ID}] Native host disconnected (port #${nativePortId}):`, error);
      nativePort = null;
      isDesktopConnected = false;
      isPortReady = false;
      isConnecting = false;

      // 재연결 시도
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`[${SW_INSTANCE_ID}] Scheduling reconnect attempt ${reconnectAttempts}...`);
        setTimeout(() => connectToNativeHost(true), RECONNECT_DELAY);
      }
    });

    reconnectAttempts = 0;
    isConnecting = false;
    nativePortId++;
    console.log(`Connected to native host (port #${nativePortId}), waiting for CONNECTED response...`);

    // CONNECTED 응답을 기다림 - Native Host가 먼저 CONNECTED를 보냄

  } catch (err) {
    console.error('Failed to connect to native host:', err);
    isDesktopConnected = false;
    isPortReady = false;
    isConnecting = false;
  }
}

// Native Host에 메시지 전송 (연결 준비될 때까지 큐에 저장)
function sendToNativeHost(message) {
  // 포트가 준비되지 않았으면 큐에 저장
  if (!nativePort || !isPortReady) {
    console.log('sendToNativeHost: port not ready, queuing message:', message.type);
    pendingMessages.push(message);

    // 연결 시도
    if (!nativePort) {
      connectToNativeHost(true);
    }
    return false;
  }

  console.log(`[${SW_INSTANCE_ID}] sendToNativeHost (port #${nativePortId}): port ready, sending message:`, message.type);
  try {
    nativePort.postMessage(message);
    console.log(`[${SW_INSTANCE_ID}] sendToNativeHost (port #${nativePortId}): postMessage completed for`, message.type);
    return true;
  } catch (err) {
    console.error('sendToNativeHost: postMessage failed:', err);
    // 전송 실패 시 큐에 다시 저장하고 재연결
    pendingMessages.push(message);
    nativePort = null;
    isDesktopConnected = false;
    isPortReady = false;
    connectToNativeHost(true);
    return false;
  }
}

// 대기 중인 메시지 모두 전송
function flushPendingMessages() {
  if (!isPortReady || pendingMessages.length === 0) return;

  console.log('Flushing', pendingMessages.length, 'pending messages');
  const messages = [...pendingMessages];
  pendingMessages = [];

  for (const msg of messages) {
    try {
      nativePort.postMessage(msg);
      console.log('Sent queued message:', msg.type);
    } catch (err) {
      console.error('Failed to send queued message:', err);
    }
  }
}

// Native Host 메시지 처리
function handleNativeMessage(message) {
  switch (message.type) {
    case 'FOCUS_STATE':
      const prevActive = focusState.isActive;
      const payload = message.payload;

      // Chrome에서 명령 처리 중이면 데스크톱 상태 업데이트 무시 (레이스 컨디션 방지)
      const now = Date.now();
      if ((pendingFocusStart || pendingFocusStop) && (now - lastCommandTime < COMMAND_COOLDOWN_MS)) {
        console.log('Ignoring desktop state update during pending command');
        // 단, 연결 상태는 업데이트
        isDesktopConnected = true;

        // pending 상태 확인 및 해제
        if (pendingFocusStart && payload.isActive) {
          console.log('Focus start confirmed by desktop');
          pendingFocusStart = false;
        }
        if (pendingFocusStop && !payload.isActive) {
          console.log('Focus stop confirmed by desktop');
          pendingFocusStop = false;
        }
        return;
      }

      // pending 상태 해제
      if (pendingFocusStart && payload.isActive) {
        console.log('Focus start confirmed by desktop');
        pendingFocusStart = false;
      }
      if (pendingFocusStop && !payload.isActive) {
        console.log('Focus stop confirmed by desktop');
        pendingFocusStop = false;
      }

      focusState = {
        ...focusState,
        ...payload
      };
      isDesktopConnected = true;

      // Focus Mode가 켜지면 즉시 탭 체크
      if (!prevActive && focusState.isActive) {
        checkAndCloseTabs();
      }

      // 팝업에 상태 전달
      broadcastState();
      break;

    case 'CONNECTED':
      console.log(`[${SW_INSTANCE_ID}] Native host connection confirmed (port #${nativePortId}) - port is now ready`);
      isDesktopConnected = true;
      isPortReady = true;

      // 연결 완료 후 상태 요청
      if (nativePort) {
        nativePort.postMessage({ type: 'GET_STATE' });
      }

      // 대기 중인 메시지 전송
      flushPendingMessages();
      break;

    case 'ERROR':
      console.error('Native host error:', message.error);
      // Desktop app not connected 에러면 연결 안됨으로 표시
      if (message.error.includes('not connected') || message.error.includes('not running')) {
        isDesktopConnected = false;
      }
      break;
  }
}

// 팝업 등에 상태 브로드캐스트
function broadcastState() {
  chrome.runtime.sendMessage({
    type: 'STATE_UPDATE',
    payload: focusState
  }).catch(() => {
    // 팝업이 열려있지 않으면 무시
  });
}

// 탭 업데이트 감지
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (focusState.isActive && changeInfo.url) {
    if (shouldBlock(changeInfo.url)) {
      chrome.tabs.remove(tabId).then(() => {
        showBlockedNotification(changeInfo.url);
      }).catch(console.error);
    }
  }
});

// 새 탭 생성 감지
chrome.tabs.onCreated.addListener((tab) => {
  if (focusState.isActive && tab.pendingUrl && shouldBlock(tab.pendingUrl)) {
    chrome.tabs.remove(tab.id).then(() => {
      showBlockedNotification(tab.pendingUrl);
    }).catch(console.error);
  }
});

// 팝업에서 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_STATE':
      sendResponse(focusState);
      break;

    case 'TOGGLE_FOCUS':
      if (isDesktopConnected) {
        sendToNativeHost({
          type: 'TOGGLE_FOCUS',
          payload: { blockedUrls: message.blockedUrls }
        });
      }
      break;

    case 'START_FOCUS':
      console.log('=== START_FOCUS received ===');
      console.log('Current focusState.isActive:', focusState.isActive);
      console.log('blockedUrls:', message.blockedUrls);

      // 이미 시작 중이면 중복 요청 무시
      if (pendingFocusStart && (Date.now() - lastCommandTime < COMMAND_COOLDOWN_MS)) {
        console.log('Ignoring duplicate START_FOCUS request');
        break;
      }

      // 이미 Focus가 활성화되어 있으면 Desktop으로 다시 보내지 않음
      // (Desktop에서 시작된 Focus를 유지)
      if (focusState.isActive) {
        console.log('Focus already active, skipping desktop sync');
        // URL만 업데이트
        focusState.blockedUrls = message.blockedUrls;
        checkAndCloseTabs();
        broadcastState();
        break;
      }

      // 먼저 로컬 상태 업데이트 및 탭 체크
      focusState = {
        isActive: true,
        blockedUrls: message.blockedUrls,
        elapsedSeconds: 0,
        timerSeconds: 0,
        timerType: message.timerType || 'none'
      };
      pendingFocusStart = true; // 데스크톱 응답 대기 중
      pendingFocusStop = false;
      lastCommandTime = Date.now();
      checkAndCloseTabs();
      broadcastState();

      // 항상 로컬 타이머 시작 (데스크톱에서 상태 받으면 덮어씌워짐)
      standaloneStartTime = Date.now();
      if (standaloneTimer) {
        clearInterval(standaloneTimer);
      }
      standaloneTimer = setInterval(() => {
        if (focusState.isActive && standaloneStartTime) {
          focusState.elapsedSeconds = Math.floor((Date.now() - standaloneStartTime) / 1000);
          broadcastState();
        }
      }, 1000);

      // 데스크톱 연결 시 데스크톱으로도 전송
      console.log(`[${SW_INSTANCE_ID}] isDesktopConnected:`, isDesktopConnected, 'nativePort:', !!nativePort, 'isPortReady:', isPortReady);
      if (isDesktopConnected && nativePort && isPortReady) {
        // 테스트: GET_STATE를 먼저 보내서 연결 확인
        console.log(`[${SW_INSTANCE_ID}] Testing connection with GET_STATE first...`);
        try {
          nativePort.postMessage({ type: 'GET_STATE' });
          console.log(`[${SW_INSTANCE_ID}] GET_STATE sent successfully`);
        } catch (e) {
          console.error(`[${SW_INSTANCE_ID}] GET_STATE failed:`, e);
        }

        console.log(`[${SW_INSTANCE_ID}] Sending START_FOCUS to native host...`);
        const sent = sendToNativeHost({
          type: 'START_FOCUS',
          payload: {
            blockedUrls: message.blockedUrls,
            timerType: message.timerType,
            timerDuration: message.timerDuration
          }
        });
        console.log(`[${SW_INSTANCE_ID}] sendToNativeHost result:`, sent);
      } else {
        console.log('Not connected to desktop, running standalone');
      }
      console.log('Focus Mode started, desktop connected:', isDesktopConnected);
      break;

    case 'STOP_FOCUS':
      console.log('=== STOP_FOCUS received ===');
      console.log('Current focusState.isActive:', focusState.isActive);

      // 이미 종료 중이면 중복 요청 무시
      if (pendingFocusStop && (Date.now() - lastCommandTime < COMMAND_COOLDOWN_MS)) {
        console.log('Ignoring duplicate STOP_FOCUS request');
        break;
      }

      // 시작 대기 중에 종료 요청이 오면 시작 취소
      if (pendingFocusStart) {
        console.log('Cancelling pending focus start');
        pendingFocusStart = false;
      }

      // 먼저 로컬 상태 업데이트
      focusState = {
        isActive: false,
        blockedUrls: [],
        elapsedSeconds: 0,
        timerSeconds: 0,
        timerType: 'none'
      };
      pendingFocusStop = true;
      lastCommandTime = Date.now();
      broadcastState();

      // 단독 모드 타이머 정리
      if (standaloneTimer) {
        clearInterval(standaloneTimer);
        standaloneTimer = null;
      }
      standaloneStartTime = null;

      // 데스크톱 연결 시 데스크톱으로 전송
      if (isDesktopConnected && nativePort) {
        console.log('Sending STOP_FOCUS to native host...');
        sendToNativeHost({ type: 'STOP_FOCUS' });
      }
      console.log('Focus Mode stopped');
      break;

    case 'UPDATE_BLOCKED_URLS':
      // 활성 상태일 때만 URL 업데이트
      if (focusState.isActive) {
        focusState.blockedUrls = message.blockedUrls;
        if (isDesktopConnected && nativePort) {
          sendToNativeHost({
            type: 'UPDATE_BLOCKED_URLS',
            payload: { blockedUrls: message.blockedUrls }
          });
        }
      }
      break;

    case 'GET_CONNECTION_STATUS':
      sendResponse({ connected: isDesktopConnected });
      break;
  }

  return true; // 비동기 응답 허용
});

// 서비스 워커 시작 시 연결 - 지연 연결로 변경
// 리로드 시 여러 인스턴스가 동시에 시작되는 문제를 방지하기 위해
// 잠시 대기 후 연결 시도
setTimeout(() => {
  console.log(`[${SW_INSTANCE_ID}] Attempting delayed connection to native host...`);
  connectToNativeHost();
}, 1000); // 1초로 늘림

console.log(`[${SW_INSTANCE_ID}] Schedule AI Focus background service started`);
