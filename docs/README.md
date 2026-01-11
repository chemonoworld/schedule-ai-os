# Schedule AI Documentation

프로젝트 문서 및 진행 상황을 관리하는 폴더입니다.

## 빠른 링크

- **[ROADMAP.md](ROADMAP.md)** - 전체 로드맵 및 완료된 기능 목록

## 폴더 구조

```
docs/
├── README.md           # 이 파일
├── ROADMAP.md          # 전체 로드맵 및 마일스톤
├── plans/              # 프로젝트 계획 및 설계 문서
│   ├── 00-project-overview.md
│   ├── 01-architecture.md
│   ├── 02-data-model.md
│   ├── 03-llm-integration.md
│   ├── 04-markdown-data-portability.md
│   ├── 05-progress-tracking.md
│   ├── 06-recurring-plans.md
│   ├── 07-focus-mode.md
└── progress/           # 개발 진행 상황
    ├── phase-1.md
    ├── phase-2.md
    ├── phase-3.md
    ├── phase-4.md
    └── phase-5.md
```

## Plans (계획)

프로젝트의 설계 및 구현 계획을 담은 문서들입니다.

| 파일 | 설명 |
|------|------|
| `00-project-overview.md` | 프로젝트 개요 및 목표 |
| `01-architecture.md` | 기술 아키텍처 설계 |
| `02-data-model.md` | 데이터 모델 및 스키마 |
| `03-llm-integration.md` | LLM (Claude) 통합 계획 |
| `04-markdown-data-portability.md` | Markdown 데이터 이식성 |
| `05-progress-tracking.md` | Progress Tracking 설계 |
| `06-recurring-plans.md` | Recurring Plans 설계 |
| `07-focus-mode.md` | Focus Mode 설계 |

## Progress (진행 상황)

각 Phase별 개발 진행 상황을 기록합니다.

| 파일 | 상태 | 설명 |
|------|------|------|
| `phase-1.md` | 완료 | 프로젝트 셋업 + 기본 UI |
| `phase-2.md` | 완료 | 핵심 데이터 모델 |
| `phase-3.md` | 완료 | LLM 통합 |
| `phase-4.md` | 완료 | Progress Tracking + Recurring Plans |
| `phase-5.md` | 완료 | Focus Mode (Soft Blocking) |

## 문서 작성 가이드

### Progress 파일 네이밍
- `phase-{번호}.md` 형식 사용
- 각 Phase는 독립적인 기능 단위로 구분

### Progress 파일 구조
```markdown
# Phase N: [Phase 이름]

> 상태: 완료/진행중/예정
> 완료일: YYYY-MM-DD

## 목표
- [x] 주요 목표 1
- [ ] 주요 목표 2

## 완료된 작업
### 1. 카테고리
- [x] 완료된 항목

## 기술적 결정
- 의사결정 사항 기록

## 향후 개선 사항
- [ ] 추후 개선 항목

---
마지막 업데이트: YYYY-MM-DD
```
