# Phase 3: 마크다운 데이터 이동성 (Markdown Data Portability)

> 상태: 완료
> 기간: 2025-12-31

## 목표

- [x] Plan을 마크다운으로 Export
- [x] Task를 일별 마크다운으로 Export
- [x] JSON에서 Import (Plan/Task)
- [x] Export/Import UI

---

## 완료된 작업

### 1. Export 기능 (Rust)

#### 1.1 마크다운 포맷터 (`src-tauri/src/export/mod.rs`)
- [x] `plan_to_markdown()` - Plan → Markdown 변환
- [x] `tasks_to_daily_markdown()` - 일별 Task → Markdown 변환
- [x] YAML Frontmatter 생성 (id, title, status, priority, dates)
- [x] 한국어 요일 변환

#### 1.2 파일 시스템 연동
- [x] `plans/` 폴더에 Plan별 마크다운 저장
- [x] `tasks/` 폴더에 날짜별 마크다운 저장
- [x] `backup.json` 전체 데이터 백업

#### 1.3 Tauri 커맨드
- [x] `export_plan_to_markdown` - 단일 Plan 마크다운 변환
- [x] `export_tasks_to_markdown` - 일별 Tasks 마크다운 변환
- [x] `export_all_to_json` - 전체 JSON Export
- [x] `export_to_folder` - 폴더에 마크다운 + JSON 저장

### 2. Import 기능 (Rust)

#### 2.1 마크다운/JSON 파서 (`src-tauri/src/import/mod.rs`)
- [x] `parse_frontmatter()` - YAML Frontmatter 파싱
- [x] `markdown_to_plan()` - Markdown → Plan 변환
- [x] `markdown_to_tasks()` - Markdown → Tasks 변환
- [x] `ImportData::from_json()` - JSON 파싱

#### 2.2 Tauri 커맨드
- [x] `import_from_json` - JSON에서 데이터 가져오기
- [x] `import_plan_from_markdown` - 마크다운에서 Plan 가져오기
- [x] `import_tasks_from_markdown` - 마크다운에서 Tasks 가져오기

### 3. UI 구현 (`src/App.tsx`)

#### 3.1 Export UI
- [x] Settings 탭에 Export/Import 섹션 추가
- [x] "JSON으로 내보내기" 버튼 (파일 저장 다이얼로그)
- [x] "마크다운으로 내보내기" 버튼 (폴더 선택 다이얼로그)
- [x] 현재 데이터 개수 표시
- [x] 날짜 범위 선택 (시작일 ~ 종료일)
- [x] 프리셋 버튼 (최근 7일/30일/90일)

#### 3.2 Import UI
- [x] "JSON에서 가져오기" 버튼 (파일 선택 다이얼로그)
- [x] 성공/실패 메시지 표시

### 4. 플러그인 및 권한

- [x] `@tauri-apps/plugin-dialog` 설치
- [x] `@tauri-apps/plugin-fs` 설치
- [x] `tauri-plugin-dialog`, `tauri-plugin-fs` Cargo 의존성
- [x] capabilities에 dialog, fs 권한 추가

---

## 진행 상황

### 완료됨 (2025-12-31)
- Rust 백엔드: export/import 모듈 구현
- Tauri 커맨드 7개 등록
- React UI: Settings에 Export/Import 섹션 추가
- 빌드 성공 확인

---

## 마크다운 포맷 예시

### Plan 파일 (`plans/learning-rust.md`)
```markdown
---
id: plan_abc123
title: Rust 학습하기
status: active
priority: 1
start_date: 2025-01-01
end_date: 2025-03-31
created_at: 2025-01-01T10:00:00Z
updated_at: 2025-01-15T14:30:00Z
---

# Rust 학습하기

## 원본 입력
> 3개월 안에 Rust로 CLI 툴을 만들 수 있을 정도로 학습하고 싶어

## 목표
- Rust 기본 문법 익히기
- 소유권과 라이프타임 이해
- 간단한 CLI 툴 완성
```

### Task 파일 (`tasks/2025-01-15.md`)
```markdown
---
date: 2025-01-15
total: 5
completed: 3
---

# 2025-01-15 (수)

## ✅ The Rust Book 3장 읽기
- id: task_001
- plan_id: plan_abc123
- estimated: 30
- actual: 35
- completed_at: 2025-01-15T09:35:00Z

## ⏳ 프로젝트 문서 작성
- id: task_005
- estimated: 60
- status: pending
```

---

## 참고 문서

- [04-markdown-data-portability.md](../plans/04-markdown-data-portability.md)

---

마지막 업데이트: 2025-12-31
