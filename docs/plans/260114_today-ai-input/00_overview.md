# Today 탭 개선 - Overview

## 개요
- **목적**: Today 탭의 사용성 향상 및 AI 기반 태스크 입력 기능 추가
- **배경**: 현재 Today 탭은 수동 태스크 입력만 지원하며, 날짜 변경 시 오늘로 빠르게 돌아오기 어려움

## 서브태스크 목록
1. [01_date-navigation](./01_date-navigation.md) - 날짜 지남 알림 및 오늘로 이동 기능
2. [02_ai-task-input](./02_ai-task-input.md) - AI 기반 태스크 작성 기능
3. [03_shortcut-settings](./03_shortcut-settings.md) - 입력 모드 전환 단축키 설정

## 전체 목표
- [x] Today 탭에서 선택된 날짜가 오늘이 아닐 때 "오늘로 이동" 버튼 표시
- [x] AI 태스크 입력 모드 추가 (시간, 날짜, 장소, 서브태스크 자동 파싱)
- [x] Shift+Tab으로 일반 입력 ↔ AI 입력 모드 전환
- [x] Settings에서 입력 모드 전환 단축키 커스터마이징

## 의존성
- Claude API (AI 태스크 파싱용)
- 기존 Settings의 단축키 관리 시스템 확장

## 관련 파일
- `schedule-ai-tauri/src/App.tsx` - Today 탭 UI (라인 1918-2030)
- `schedule-ai-tauri/src/stores/taskStore.ts` - 태스크 상태 관리
- `schedule-ai-tauri/src/db/index.ts` - 데이터베이스 로직
- `schedule-ai-tauri/src-tauri/src/lib.rs` - Rust 백엔드 (설정 관리)

## 기술 스택
| 영역 | 기술 |
|------|------|
| UI | React + TypeScript |
| 상태관리 | Zustand |
| AI | Claude API (packages/llm-client) |
| 설정 저장 | Tauri settings.json |
