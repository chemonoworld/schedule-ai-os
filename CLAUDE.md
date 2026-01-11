# Schedule AI

ADHD 환자를 위한 일정 관리 앱. Tauri v2 + React + Rust 기반.

## 문서 자동 업데이트 규칙

**기능 구현 완료 시 반드시 다음 문서를 업데이트:**

1. `docs/ROADMAP.md` - 상태 테이블 및 체크리스트
2. `docs/plans/{기능}.md` - 구현 내용 반영
3. `docs/progress/phase-{N}.md` - 완료 상태로 변경

**버그 수정 시:**

4. `docs/troubleshooting/{버그명}.md` - 증상, 원인, 해결 방법 기록

사용자가 요청하지 않아도 코드 작업 완료 후 자동으로 문서 동기화할 것.

## 프로젝트 구조

```
schedule-ai/
├── schedule-ai-tauri/     # Tauri 데스크톱 앱
│   ├── src/               # React 프론트엔드
│   └── src-tauri/         # Rust 백엔드
├── schedule-ai-server/    # Axum 백엔드 서버 (구독, LLM Proxy, 동기화)
│   └── src/
├── packages/              # 공유 패키지
│   ├── core/              # 타입 및 유틸리티
│   ├── ui/                # UI 컴포넌트
│   └── llm-client/        # LLM 클라이언트
├── docs/                  # 문서
│   ├── ROADMAP.md         # 전체 로드맵
│   ├── plans/             # 설계 문서
│   ├── progress/          # 진행 기록
│   └── troubleshooting/   # 버그 수정 기록
└── .claude/
    └── skills/            # Claude Code 스킬
```

## 기술 스택

| 영역 | 기술 |
|------|------|
| 데스크톱 앱 | Tauri v2 |
| 프론트엔드 | React + TypeScript + Zustand |
| 데스크톱 백엔드 | Rust (Tauri) |
| 서버 백엔드 | Rust (Axum) |
| 데이터베이스 | SQLite (로컬), PostgreSQL (서버) |
| LLM | Claude API |
| macOS Native | objc2, cocoa |

## 주요 문서

- [docs/ROADMAP.md](docs/ROADMAP.md) - 전체 로드맵 및 완료된 기능
- [docs/README.md](docs/README.md) - 문서 폴더 개요
- [docs/plans/09-subscription-server.md](docs/plans/09-subscription-server.md) - 구독 모델 및 서버 설계

## 개발 명령어

```bash
# 데스크톱 앱 개발 서버
cd schedule-ai-tauri && pnpm tauri dev

# 데스크톱 앱 빌드
cd schedule-ai-tauri && pnpm tauri build

# 서버 실행
cd schedule-ai-server && cargo run

# 전체 빌드
pnpm build
```

## 코딩 스타일

- Rust 스타일 선호
- 한글 주석/문서 사용
