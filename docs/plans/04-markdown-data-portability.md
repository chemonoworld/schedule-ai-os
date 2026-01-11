# 마크다운 기반 데이터 이동성 (Markdown Data Portability)

## 목표

사용자가 데이터를 마크다운 형식으로 Export/Import할 수 있도록 하여:
- 데이터 소유권 보장 (Lock-in 방지)
- 다른 도구와의 호환성 (Obsidian, Notion, GitHub 등)
- 백업 및 버전 관리 용이
- Human-readable 포맷 유지

## 핵심 설계 원칙

### 1. Markdown-First 철학
- 내부 저장소(SQLite)와 별개로, 마크다운이 "진짜" 데이터
- 필요시 마크다운에서 DB 재구축 가능
- 마크다운 파일 자체로 완결성 있는 문서

### 2. 양방향 동기화
```
┌─────────────┐     Export     ┌─────────────────┐
│   SQLite    │ ────────────▶  │  Markdown Files │
│   (Fast)    │ ◀────────────  │  (Portable)     │
└─────────────┘     Import     └─────────────────┘
```

---

## 마크다운 스키마 설계

### Plans (계획)

```markdown
<!-- plans/learning-rust.md -->
---
id: plan_abc123
title: Rust 학습하기
status: active
priority: 1
start_date: 2025-01-01
end_date: 2025-03-31
recurrence: null
created_at: 2025-01-01T10:00:00Z
updated_at: 2025-01-15T14:30:00Z
---

# Rust 학습하기

## 원본 입력
> 3개월 안에 Rust로 CLI 툴을 만들 수 있을 정도로 학습하고 싶어

## 목표
- [ ] Rust 기본 문법 익히기
- [ ] 소유권과 라이프타임 이해
- [ ] 간단한 CLI 툴 완성

## 마일스톤

### 1월: 기초
- The Rust Book 1-10장 읽기
- rustlings 완료

### 2월: 심화
- async/await 이해
- tokio 기본 사용법

### 3월: 프로젝트
- CLI 툴 기획 및 구현

## 메모
- 매일 30분씩 꾸준히
- 모르는 부분은 Discord 커뮤니티 활용
```

### Tasks (일일 태스크)

```markdown
<!-- tasks/2025-01-15.md -->
---
date: 2025-01-15
summary:
  total: 5
  completed: 3
  skipped: 1
  pending: 1
---

# 2025-01-15 (수)

## 오늘의 태스크

### ✅ The Rust Book 3장 읽기
- id: task_001
- plan: [[learning-rust]]
- scheduled_time: 09:00
- estimated: 30min
- actual: 35min
- completed_at: 2025-01-15T09:35:00Z

### ✅ rustlings 5문제 풀기
- id: task_002
- plan: [[learning-rust]]
- scheduled_time: 10:00
- estimated: 45min
- actual: 40min
- completed_at: 2025-01-15T10:40:00Z

### ✅ 점심 운동
- id: task_003
- scheduled_time: 12:00
- estimated: 60min
- actual: 55min
- completed_at: 2025-01-15T12:55:00Z

### ⏭️ 이메일 정리
- id: task_004
- scheduled_time: 14:00
- estimated: 20min
- skipped_reason: 긴급 미팅으로 인해 스킵

### ⏳ 프로젝트 문서 작성
- id: task_005
- scheduled_time: 15:00
- estimated: 60min
- status: pending

## 회고
오늘 Rust 학습은 순조로웠다. 소유권 개념이 조금씩 이해되기 시작함.
```

### Backlog (백로그)

```markdown
<!-- backlog.md -->
---
updated_at: 2025-01-15T20:00:00Z
---

# 백로그

## 🔴 High Priority
- [ ] CI/CD 파이프라인 구축 #devops
- [ ] 사용자 피드백 수집 폼 만들기 #product

## 🟡 Medium Priority
- [ ] 다크모드 지원 #ui
- [ ] 키보드 단축키 추가 #ux
- [ ] 성능 최적화 #tech-debt

## 🟢 Low Priority
- [ ] 애니메이션 개선 #polish
- [ ] 튜토리얼 작성 #docs

## 💡 Ideas (Someday/Maybe)
- [ ] AI 기반 일정 추천 고도화
- [ ] 팀 협업 기능
- [ ] 캘린더 연동 (Google, Apple)
```

---

## 디렉토리 구조

```
schedule-ai-data/
├── plans/
│   ├── learning-rust.md
│   ├── side-project.md
│   └── health-routine.md
├── tasks/
│   ├── 2025-01-13.md
│   ├── 2025-01-14.md
│   └── 2025-01-15.md
├── backlog.md
├── settings.md
└── .schedule-ai/
    └── meta.json          # 동기화 메타데이터
```

---

## Export 기능

### Export 옵션

```typescript
interface ExportOptions {
  format: 'markdown' | 'json' | 'csv';
  scope: {
    plans: boolean;
    tasks: boolean;
    backlog: boolean;
    settings: boolean;
  };
  dateRange?: {
    start: string;
    end: string;
  };
  destination: 'file' | 'clipboard' | 'folder';
}
```

### Export 구현 (Rust)

```rust
// src-tauri/src/export/mod.rs

pub struct MarkdownExporter;

impl MarkdownExporter {
    pub fn export_plan(plan: &Plan) -> String {
        let mut content = String::new();

        // Frontmatter
        content.push_str("---\n");
        content.push_str(&format!("id: {}\n", plan.id));
        content.push_str(&format!("title: {}\n", plan.title));
        content.push_str(&format!("status: {}\n", plan.status));
        // ... 기타 필드
        content.push_str("---\n\n");

        // 본문
        content.push_str(&format!("# {}\n\n", plan.title));

        if let Some(desc) = &plan.description {
            content.push_str(&format!("{}\n\n", desc));
        }

        content
    }

    pub fn export_daily_tasks(date: &str, tasks: &[Task]) -> String {
        // 일일 태스크를 마크다운으로 변환
    }
}
```

---

## Import 기능

### Import 파이프라인

```
Markdown File → Parser → Validation → Merge Strategy → SQLite
```

### Frontmatter 파싱

```rust
// src-tauri/src/import/parser.rs

use gray_matter::{Matter, engine::YAML};

pub struct MarkdownDocument {
    pub frontmatter: Frontmatter,
    pub content: String,
}

pub fn parse_markdown(input: &str) -> Result<MarkdownDocument, ParseError> {
    let matter = Matter::<YAML>::new();
    let result = matter.parse(input);

    Ok(MarkdownDocument {
        frontmatter: serde_yaml::from_str(&result.data.unwrap())?,
        content: result.content,
    })
}
```

### Merge 전략

```typescript
type MergeStrategy =
  | 'overwrite'      // 마크다운 내용으로 덮어쓰기
  | 'keep_local'     // 로컬 DB 유지, 새 항목만 추가
  | 'merge'          // 필드별 최신 값 사용 (updated_at 기준)
  | 'manual';        // 충돌 시 사용자에게 선택권
```

---

## 동기화 메커니즘

### 자동 Export (선택적)

```typescript
interface SyncSettings {
  autoExport: boolean;
  exportPath: string;           // 예: ~/Documents/ScheduleAI
  exportFrequency: 'realtime' | 'hourly' | 'daily' | 'manual';
  gitIntegration: boolean;      // 변경시 자동 커밋
}
```

### 파일 감시 (Watch Mode)

```rust
// src-tauri/src/sync/watcher.rs

use notify::{Watcher, RecursiveMode};

pub fn watch_markdown_folder(path: &Path) -> Result<(), WatchError> {
    let mut watcher = notify::recommended_watcher(|res| {
        match res {
            Ok(event) => handle_file_change(event),
            Err(e) => log::error!("Watch error: {:?}", e),
        }
    })?;

    watcher.watch(path, RecursiveMode::Recursive)?;
    Ok(())
}
```

---

## UI 설계

### Export 다이얼로그

```
┌─────────────────────────────────────────────────┐
│  📤 데이터 내보내기                              │
├─────────────────────────────────────────────────┤
│                                                 │
│  포맷: ● Markdown  ○ JSON  ○ CSV               │
│                                                 │
│  범위:                                          │
│    ☑️ Plans (3개)                               │
│    ☑️ Tasks (지난 30일)                         │
│    ☑️ Backlog                                   │
│    ☐ Settings                                  │
│                                                 │
│  날짜 범위: [2025-01-01] ~ [2025-01-31]        │
│                                                 │
│  저장 위치: ~/Documents/ScheduleAI  [변경]      │
│                                                 │
├─────────────────────────────────────────────────┤
│                         [취소]  [내보내기]      │
└─────────────────────────────────────────────────┘
```

### Import 다이얼로그

```
┌─────────────────────────────────────────────────┐
│  📥 데이터 가져오기                              │
├─────────────────────────────────────────────────┤
│                                                 │
│  파일/폴더 선택: [파일 선택...]                  │
│                                                 │
│  선택된 항목:                                   │
│    📁 schedule-ai-data/                         │
│       ├── 📄 plans/ (3 files)                  │
│       ├── 📄 tasks/ (15 files)                 │
│       └── 📄 backlog.md                        │
│                                                 │
│  충돌 해결: ● 병합 (최신 우선)                  │
│            ○ 덮어쓰기                          │
│            ○ 건너뛰기                          │
│                                                 │
├─────────────────────────────────────────────────┤
│                         [취소]  [가져오기]      │
└─────────────────────────────────────────────────┘
```

---

## Tauri 커맨드

```rust
// src-tauri/src/commands/export.rs

#[tauri::command]
pub async fn export_to_markdown(
    db: State<'_, DbPool>,
    options: ExportOptions,
) -> Result<ExportResult, Error> {
    let exporter = MarkdownExporter::new();

    match options.scope {
        Scope::Plans => exporter.export_all_plans(&db).await,
        Scope::Tasks { start, end } => exporter.export_tasks(&db, start, end).await,
        // ...
    }
}

#[tauri::command]
pub async fn import_from_markdown(
    db: State<'_, DbPool>,
    path: PathBuf,
    strategy: MergeStrategy,
) -> Result<ImportResult, Error> {
    let importer = MarkdownImporter::new(strategy);
    importer.import_folder(&db, &path).await
}

#[tauri::command]
pub async fn set_sync_settings(
    settings: SyncSettings,
) -> Result<(), Error> {
    // 동기화 설정 저장 및 watcher 시작/중지
}
```

---

## 구현 순서

### Phase 1: 기본 Export
1. [ ] Plan을 마크다운으로 변환하는 함수
2. [ ] Task를 일별 마크다운으로 변환
3. [ ] 폴더 구조 생성 및 파일 쓰기
4. [ ] Export UI (파일 저장 다이얼로그)

### Phase 2: 기본 Import
1. [ ] Frontmatter 파서 구현
2. [ ] 마크다운 → Plan/Task 변환
3. [ ] Import UI (파일 선택 다이얼로그)
4. [ ] 기본 Merge 전략 (overwrite)

### Phase 3: 고급 기능
1. [ ] 충돌 감지 및 해결 UI
2. [ ] 자동 Export 설정
3. [ ] 파일 감시 (Watch) 모드
4. [ ] Git 연동 (선택적)

---

## 관련 문서

- [02-data-model.md](./02-data-model.md) - 데이터 모델
- [05-progress-tracking.md](./05-progress-tracking.md) - 진행률 추적

---

마지막 업데이트: 2025-12-31
