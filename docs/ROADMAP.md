# Schedule AI 로드맵

## 현재 상태

| Phase | 이름 | 상태 |
|-------|------|------|
| Phase 1 | 프로젝트 셋업 | 완료 |
| Phase 2 | 핵심 데이터 모델 | 완료 |
| Phase 3 | LLM 통합 | 완료 |
| Phase 4 | Progress Tracking & Recurring Plans | 완료 |
| Phase 5 | 집중 모드 (Focus Mode) | 완료 |
| Phase 6 | i18n (다국어 지원) | 완료 |
| Phase 7 | 웹사이트 & 배포 | 완료 |
| Phase 8 | 구독 모델 & 백엔드 서버 | 진행중 |
| Phase 9 | 모바일 확장 | 예정 |

---

## 완료된 기능

### MVP (Phase 1-4)
- [x] Tauri v2 + React 프로젝트 구조
- [x] SQLite 연동 및 기본 CRUD
- [x] Claude API 연동
- [x] Plan 입력 → AI 구조화
- [x] 일일 TODO 생성 및 관리
- [x] 기본 알림 시스템
- [x] Progress Tracking
  - [x] 일일 진행률 계산
  - [x] 연간 히트맵
  - [x] 연속 기록 (Streak)
- [x] Recurring Plans (반복 일정)
  - [x] 자연어 입력 → AI 파싱
  - [x] 일간/주간/월간 반복
  - [x] 태스크 자동 생성
- [x] Export/Import
  - [x] Markdown 내보내기
  - [x] JSON 백업/복원

### Focus Mode (Phase 5) - Hard Blocking
- [x] macOS 집중 모드 (Hard Blocking)
  - [x] 실행 중인 앱 목록 조회 (NSWorkspace)
  - [x] 현재 활성 앱 감지 (1초 폴링)
  - [x] 차단 앱 감지 시 강제 종료 (NSRunningApplication.terminate/forceTerminate)
  - [x] 알림 발송 (소리 포함, 중복 방지)
  - [x] 경과 시간 타이머
  - [x] 개선된 UI (칩 스타일 앱 선택, 다크 타이머)
  - [x] 집중 모드 중 오늘의 할 일 표시
  - [x] 태스크 섹션 클릭 시 Today 탭 이동
  - [x] 탭 이동 시에도 블로킹 유지 (전역 폴링)
- [x] Chrome Extension - 웹사이트 차단
  - [x] Manifest V3 Service Worker
  - [x] Native Messaging Host (Rust)
  - [x] 팝업 UI (Focus Mode 토글, URL 관리)
  - [x] 차단 URL 탭 자동 닫기
  - [x] Chrome 알림 표시
  - [ ] Desktop ↔ Extension 양방향 동기화 (불안정)

### i18n (Phase 6)
- [x] 다국어 지원 기반 구축
  - [x] i18next + react-i18next 설정
  - [x] 네임스페이스 기반 번역 파일 구조
  - [x] 영어/한국어 번역 파일 (6개 네임스페이스)
  - [x] Rust 시스템 언어 감지 커맨드
  - [x] 언어 설정 저장/로드
  - [x] Settings 탭 언어 선택 UI
  - [x] 빌드 테스트 완료

### 웹사이트 & 배포 (Phase 7)
- [x] schedule-ai-web (Next.js) 프로젝트 생성
  - [x] 랜딩 페이지 (히어로, 기능 소개)
  - [x] 다운로드 페이지 (GitHub Releases 연동)
  - [x] SEO 메타데이터 (hreflang 지원)
  - [x] i18n 다국어 지원 (next-intl)
  - [x] URL 기반 라우팅 (`/en`, `/ko`)
- [x] GitHub Actions 릴리즈 워크플로우
  - [x] tauri-action으로 macOS 빌드 자동화
  - [x] Apple Silicon (aarch64) + Intel (x64) 지원
  - [x] 태그 푸시 시 자동 릴리즈 생성
- [x] 앱 아이콘 및 파비콘
  - [x] Focus 테마 SVG 아이콘 디자인
  - [x] 모든 플랫폼용 아이콘 생성 (macOS, Windows, Linux, iOS, Android)
  - [x] 웹사이트 파비콘 적용
- [x] Vercel 배포 준비

---

## 진행 중인 기능

### Phase 8: 구독 모델 & 백엔드 서버
- [x] 모노레포 구조 변경 (schedule-ai-tauri, schedule-ai-server)
- [x] Axum 프로젝트 초기화
- [ ] PostgreSQL 연동
- [ ] 인증 시스템 (JWT)
- [ ] 구독 관리 (Stripe)
- [ ] LLM Proxy API
- [ ] 기기간 동기화 API
- [ ] 클라이언트 연동

---

## 예정된 기능

### Phase 9: 모바일 확장
- [ ] iOS 빌드 및 배포
- [ ] Android 빌드 및 배포
- [ ] 반응형 UI

### 추후 개선
- [ ] Core Time 스케줄 기반 자동 집중 모드
- [ ] Medium Blocking (Accessibility 권한으로 앱 숨김)
- [x] Windows IPC 지원 (interprocess 크레이트로 Named Pipe 구현)
- [ ] 로컬 LLM (Ollama)
- [ ] 통계/분석 대시보드
- [ ] 음성 입력
- [ ] Pomodoro 타이머 통합
- [ ] 집중 시간 리포트

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 데스크톱 앱 | Tauri v2 |
| 프론트엔드 | React + TypeScript + Zustand |
| 데스크톱 백엔드 | Rust (Tauri) |
| 서버 백엔드 | Rust (Axum) |
| 데이터베이스 | SQLite (로컬), PostgreSQL (서버) |
| LLM | Claude API |
| macOS Native | objc2, cocoa, core-graphics, core-foundation |
| 웹 프론트엔드 | Next.js + Tailwind CSS |
| 웹 호스팅 | Vercel |
| CI/CD | GitHub Actions + tauri-action |

---

## 문서 링크

### 설계 문서 (docs/plans/)
- [00-project-overview.md](plans/00-project-overview.md) - 프로젝트 개요
- [01-architecture.md](plans/01-architecture.md) - 아키텍처
- [02-data-model.md](plans/02-data-model.md) - 데이터 모델
- [03-llm-integration.md](plans/03-llm-integration.md) - LLM 통합
- [04-markdown-data-portability.md](plans/04-markdown-data-portability.md) - Markdown 데이터 이식성
- [05-progress-tracking.md](plans/05-progress-tracking.md) - Progress Tracking
- [06-recurring-plans.md](plans/06-recurring-plans.md) - Recurring Plans
- [07-focus-mode.md](plans/07-focus-mode.md) - Focus Mode
- [08-i18n.md](plans/08-i18n.md) - i18n (다국어 지원)
- [09-website-distribution.md](plans/09-website-distribution.md) - 웹사이트 & 배포
- [10-subscription-server.md](plans/10-subscription-server.md) - 구독 모델 & 백엔드 서버
- [11-mobile-platform.md](plans/11-mobile-platform.md) - 모바일 플랫폼 지원

### 진행 기록 (docs/progress/)
- [phase-1.md](progress/phase-1.md) - Phase 1 완료
- [phase-2.md](progress/phase-2.md) - Phase 2 완료
- [phase-3.md](progress/phase-3.md) - Phase 3 완료
- [phase-4.md](progress/phase-4.md) - Phase 4 완료
- [phase-5.md](progress/phase-5.md) - Phase 5 완료
- [phase-6.md](progress/phase-6.md) - Phase 6 완료
- [phase-7.md](progress/phase-7.md) - Phase 7 완료

---

마지막 업데이트: 2026-01-05
