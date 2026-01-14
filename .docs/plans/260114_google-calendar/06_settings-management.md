# Settings에서 연동 관리

## 개요
- **상위 태스크**: [Google Calendar 연동](./00_overview.md)
- **이전 단계**: [05_progress-integration.md](./05_progress-integration.md)
- **목적**: Settings 탭에서 Google Calendar 연동 상태 관리
- **상태**: 대기

## 목표
- [ ] Google 계정 연결 UI 구현
- [ ] 연동 상태 표시
- [ ] 동기화할 캘린더 선택 UI 구현
- [ ] 연동 해제 기능 구현
- [ ] 동기화 설정 (자동/수동) 구현

## 구현 계획

### 1. Settings 탭 UI 추가

**App.tsx Settings 탭 확장**:
```tsx
{activeTab === 'settings' && (
  <div className="settings-content">
    {/* 기존 설정들 */}
    <LanguageSetting />
    <ApiKeySetting />
    <PlanRulesSetting />

    {/* 새로운 섹션: Google Calendar */}
    <div className="settings-section">
      <h3 className="section-title">
        <span className="icon">📅</span>
        {t('settings.googleCalendar.title')}
      </h3>

      <GoogleCalendarSettings />
    </div>

    {/* 기존 설정들 */}
    <TabShortcutsSetting />
    <GlobalShortcutSetting />
  </div>
)}
```

### 2. Google Calendar 설정 컴포넌트

```tsx
function GoogleCalendarSettings() {
  const {
    isConnected,
    userEmail,
    calendars,
    selectedCalendarIds,
    connect,
    disconnect,
    toggleCalendarSelection,
    syncCalendars
  } = useCalendarStore();

  const [isLoading, setIsLoading] = useState(false);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      await connect();
      await syncCalendars();
    } catch (error) {
      console.error('Failed to connect:', error);
      // 에러 토스트 표시
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (window.confirm(t('settings.googleCalendar.disconnectConfirm'))) {
      await disconnect();
    }
  };

  return (
    <div className="google-calendar-settings">
      {!isConnected ? (
        // 미연결 상태
        <div className="connect-section">
          <p className="description">
            {t('settings.googleCalendar.connectDescription')}
          </p>
          <button
            className="connect-button"
            onClick={handleConnect}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="loading-spinner" />
            ) : (
              <>
                <GoogleIcon />
                {t('settings.googleCalendar.connect')}
              </>
            )}
          </button>
        </div>
      ) : (
        // 연결됨 상태
        <div className="connected-section">
          {/* 연결된 계정 정보 */}
          <div className="account-info">
            <div className="account-row">
              <span className="label">{t('settings.googleCalendar.account')}</span>
              <span className="value">{userEmail}</span>
            </div>
            <button
              className="disconnect-button"
              onClick={handleDisconnect}
            >
              {t('settings.googleCalendar.disconnect')}
            </button>
          </div>

          {/* 캘린더 선택 */}
          <div className="calendar-selection">
            <div className="selection-header">
              <span className="label">
                {t('settings.googleCalendar.calendars')}
              </span>
              <button
                className="refresh-button"
                onClick={() => syncCalendars()}
              >
                🔄 {t('common.refresh')}
              </button>
            </div>

            <div className="calendar-list">
              {calendars.map(calendar => (
                <label
                  key={calendar.id}
                  className="calendar-item"
                >
                  <input
                    type="checkbox"
                    checked={selectedCalendarIds.includes(calendar.id)}
                    onChange={() => toggleCalendarSelection(calendar.id)}
                  />
                  <span
                    className="calendar-color"
                    style={{ background: calendar.backgroundColor }}
                  />
                  <span className="calendar-name">
                    {calendar.summary}
                    {calendar.isPrimary && (
                      <span className="primary-badge">
                        {t('settings.googleCalendar.primary')}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* 동기화 설정 */}
          <SyncSettings />
        </div>
      )}
    </div>
  );
}
```

### 3. 동기화 설정 컴포넌트

```tsx
function SyncSettings() {
  const { syncMode, setSyncMode, lastSyncAt } = useCalendarStore();

  return (
    <div className="sync-settings">
      <h4>{t('settings.googleCalendar.syncSettings')}</h4>

      {/* 동기화 모드 */}
      <div className="setting-row">
        <span className="label">{t('settings.googleCalendar.syncMode')}</span>
        <select
          value={syncMode}
          onChange={(e) => setSyncMode(e.target.value as SyncMode)}
        >
          <option value="auto">
            {t('settings.googleCalendar.syncAuto')}
          </option>
          <option value="manual">
            {t('settings.googleCalendar.syncManual')}
          </option>
        </select>
      </div>

      {/* 마지막 동기화 시간 */}
      <div className="setting-row">
        <span className="label">{t('settings.googleCalendar.lastSync')}</span>
        <span className="value">
          {lastSyncAt
            ? formatRelativeTime(lastSyncAt)
            : t('settings.googleCalendar.neverSynced')
          }
        </span>
      </div>

      {/* 수동 동기화 버튼 */}
      <button
        className="sync-now-button"
        onClick={() => syncEvents()}
      >
        {t('settings.googleCalendar.syncNow')}
      </button>
    </div>
  );
}
```

### 4. CSS 스타일

**App.css 추가**:
```css
/* Google Calendar Settings */
.google-calendar-settings {
  padding: 16px;
  background: var(--surface-secondary);
  border-radius: 12px;
}

/* 연결 버튼 */
.connect-button {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  background: #4285f4;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease;
}

.connect-button:hover {
  background: #3367d6;
}

.connect-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 연결된 계정 */
.account-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--surface-primary);
  border-radius: 8px;
  margin-bottom: 16px;
}

.disconnect-button {
  color: var(--error);
  background: none;
  border: 1px solid var(--error);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.disconnect-button:hover {
  background: var(--error-subtle);
}

/* 캘린더 목록 */
.calendar-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.calendar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: var(--surface-primary);
  border-radius: 6px;
  cursor: pointer;
}

.calendar-item:hover {
  background: var(--surface-hover);
}

.calendar-color {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.primary-badge {
  font-size: 11px;
  color: var(--text-tertiary);
  background: var(--surface-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 8px;
}

/* 동기화 설정 */
.sync-settings {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.sync-settings h4 {
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.sync-now-button {
  width: 100%;
  padding: 10px;
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  margin-top: 8px;
}
```

### 5. 다국어 지원

**src/i18n/locales/ko.json 추가**:
```json
{
  "settings": {
    "googleCalendar": {
      "title": "Google Calendar",
      "connect": "Google 계정 연결",
      "connectDescription": "Google Calendar를 연결하면 일정을 Schedule AI에서 함께 볼 수 있습니다.",
      "disconnect": "연결 해제",
      "disconnectConfirm": "정말 Google Calendar 연결을 해제하시겠습니까?",
      "account": "연결된 계정",
      "calendars": "표시할 캘린더",
      "primary": "기본",
      "syncSettings": "동기화 설정",
      "syncMode": "동기화 방식",
      "syncAuto": "자동 (권장)",
      "syncManual": "수동",
      "lastSync": "마지막 동기화",
      "neverSynced": "아직 동기화하지 않음",
      "syncNow": "지금 동기화"
    }
  }
}
```

**src/i18n/locales/en.json 추가**:
```json
{
  "settings": {
    "googleCalendar": {
      "title": "Google Calendar",
      "connect": "Connect Google Account",
      "connectDescription": "Connect your Google Calendar to see your events in Schedule AI.",
      "disconnect": "Disconnect",
      "disconnectConfirm": "Are you sure you want to disconnect Google Calendar?",
      "account": "Connected Account",
      "calendars": "Calendars to Display",
      "primary": "Primary",
      "syncSettings": "Sync Settings",
      "syncMode": "Sync Mode",
      "syncAuto": "Automatic (Recommended)",
      "syncManual": "Manual",
      "lastSync": "Last Synced",
      "neverSynced": "Never synced",
      "syncNow": "Sync Now"
    }
  }
}
```

### 6. 설정 저장

**calendarStore.ts에 persist 설정**:
```typescript
// localStorage에 저장할 상태
interface PersistedCalendarState {
  selectedCalendarIds: string[];
  syncMode: SyncMode;
}

// Zustand persist middleware 사용
export const useCalendarStore = create(
  persist<CalendarState>(
    (set, get) => ({
      // ... state
    }),
    {
      name: 'calendar-settings',
      partialize: (state) => ({
        selectedCalendarIds: state.selectedCalendarIds,
        syncMode: state.syncMode
      })
    }
  )
);
```

## 고려사항

### 보안
- OAuth 연결 시 최소 권한만 요청 (readonly)
- 연결 해제 시 모든 로컬 데이터 삭제

### UX
- 연결 과정에서 로딩 상태 표시
- 에러 발생 시 명확한 메시지
- 캘린더 선택 변경 시 즉시 반영

### 접근성
- 키보드로 모든 기능 접근 가능
- 스크린 리더 지원

## 관련 파일
- `/src/App.tsx` - Settings 탭
- `/src/App.css` - 스타일
- `/src/stores/calendarStore.ts` - 캘린더 상태
- `/src/i18n/locales/ko.json` - 한국어 번역
- `/src/i18n/locales/en.json` - 영어 번역

## 완료 기준

모든 서브태스크가 완료되면 Google Calendar 연동 기능이 완성됩니다:
1. 서버에서 안전하게 OAuth 처리 (Client Secret 보호)
2. 서버 API를 통한 캘린더 데이터 프록시
3. Desktop 앱에서 서버 API로 캘린더 연동
4. Today 탭에 이벤트와 태스크 통합 표시
5. Progress 탭 히트맵에 캘린더 이벤트 반영
6. Settings에서 연동 관리 가능
