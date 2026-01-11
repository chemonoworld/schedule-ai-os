# ADHD 일정관리 앱 - 프로젝트 개요

## 비전
ADHD 환자가 매일 TODO를 짜는 부담 없이, 한 번 설정한 Plan을 기반으로 LLM이 매일 적절한 태스크를 제안하고 집중할 수 있도록 돕는 앱

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Tauri v2 |
| 프론트엔드 | React + TypeScript + Vite |
| 백엔드 | Rust |
| DB | SQLite (로컬) |
| LLM | Claude API (확장 가능 구조) |
| 타겟 | macOS, iOS, Android (추후 Windows) |

## MVP 핵심 기능

### 1. 스마트 TODO 시스템
- 텍스트/보이스로 Plan 입력 → LLM이 구조화
- Plan 기반 일일 TODO 자동 생성
- 서브태스크 자동 분해
- 적응형 알림 (현재/다음 태스크)

### 2. 코어타임 집중 모드
- 앱 블로킹/블러 처리
- 스케줄 기반 자동 활성화

## 프로젝트 구조

```
schedule-ai/
├── apps/
│   └── desktop/              # Tauri 앱
│       ├── src/              # React 프론트엔드
│       └── src-tauri/        # Rust 백엔드
├── packages/
│   ├── ui/                   # 공유 UI 컴포넌트
│   ├── core/                 # 비즈니스 로직
│   └── llm-client/           # LLM 추상화
├── plans/                    # 계획 문서
└── turbo.json                # TurboRepo
```

## 관련 문서
- [01-architecture.md](./01-architecture.md) - 상세 아키텍처
- [02-data-model.md](./02-data-model.md) - 데이터 모델
- [03-llm-integration.md](./03-llm-integration.md) - LLM 통합 설계
