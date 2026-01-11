# Phase 7: 웹사이트 & 배포

## 개요

Schedule AI 랜딩 페이지 및 다운로드 시스템 구축. Next.js 웹사이트와 GitHub Actions를 통한 자동 빌드/릴리즈 파이프라인 구현.

## 목표

- [x] schedule-ai-web (Next.js) 프로젝트 생성
- [x] 랜딩 페이지 (히어로, 기능 소개)
- [x] 다운로드 페이지 (GitHub Releases 연동)
- [x] SEO 메타데이터
- [x] GitHub Actions 릴리즈 워크플로우
- [x] macOS 빌드 자동화 (Apple Silicon + Intel)
- [x] 모노레포 설정 업데이트
- [x] i18n 다국어 지원 (한국어/영어)
- [x] URL 기반 라우팅 (`/en`, `/ko`)
- [x] 앱 아이콘 및 파비콘 제작
- [x] 멀티 플랫폼 릴리즈 워크플로우 구현
- [x] 빌드 테스트 완료
- [x] Private 저장소 GitHub API 인증 설정
- [x] v0.0.3 릴리즈 배포 완료
- [x] 다운로드 페이지 플랫폼 자동 감지 (macOS/Windows/Linux)
- [x] 다운로드 페이지 macOS 아키텍처 자동 감지 (Apple Silicon/Intel)
- [x] Windows/Linux 다운로드 지원

## 구현 내용

### 1. Next.js 프로젝트 구조

```
schedule-ai-web/
├── messages/
│   ├── en.json               # 영어 번역
│   └── ko.json               # 한국어 번역
├── src/
│   ├── app/
│   │   ├── layout.tsx        # 루트 레이아웃
│   │   └── [locale]/         # URL 기반 i18n 라우팅
│   │       ├── layout.tsx    # 언어별 레이아웃 + SEO
│   │       ├── page.tsx      # 랜딩 페이지
│   │       └── download/
│   │           ├── page.tsx  # 다운로드 페이지
│   │           └── DownloadContent.tsx
│   ├── components/
│   │   ├── Header.tsx        # 네비게이션
│   │   ├── Hero.tsx          # 히어로 섹션
│   │   ├── Features.tsx      # 기능 소개
│   │   ├── Footer.tsx        # 푸터
│   │   └── LanguageSwitcher.tsx  # 언어 선택 (URL 전환)
│   ├── i18n/
│   │   ├── routing.ts        # 라우팅 설정
│   │   ├── request.ts        # next-intl 설정
│   │   └── navigation.ts     # Link, useRouter 등
│   └── lib/
│       └── github.ts         # GitHub API 헬퍼
├── middleware.ts             # 언어 리디렉션 미들웨어
├── package.json
├── next.config.ts
└── tailwind.config.ts
```

### 2. 랜딩 페이지 구성

| 섹션 | 내용 |
|------|------|
| Header | 로고, 네비게이션, 다운로드 버튼 |
| Hero | 핵심 가치 제안, CTA 버튼 |
| Features | 6개 주요 기능 카드 |
| Footer | 저작권 정보 |

### 3. 다운로드 페이지 기능

- GitHub Releases API에서 최신 버전 fetch
- **Private 저장소 지원**: `GITHUB_TOKEN` 환경 변수로 인증
- **플랫폼 자동 감지**: macOS/Windows/Linux 자동 판별하여 우선 표시
- **macOS 아키텍처 감지**: WebGL GPU 렌더러로 Apple Silicon/Intel 자동 판별
- 모든 플랫폼 다운로드 지원:
  - macOS: DMG (aarch64, x64)
  - Windows: EXE 설치 프로그램, MSI 패키지
  - Linux: DEB, AppImage, RPM
- 버전, 파일 크기, 릴리즈 날짜 표시
- 플랫폼별 설치 가이드

#### 플랫폼 감지 로직

```typescript
// lib/platform.ts
export function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}
```

#### macOS 아키텍처 감지

```typescript
// WebGL GPU 렌더러로 감지
const gl = canvas.getContext("webgl");
const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
// "Apple M1/M2/M3" → Apple Silicon
// "Intel" → Intel
```

#### Private 저장소 설정

`.env.local` 파일에 GitHub Token 설정:
```env
GITHUB_TOKEN=github_pat_xxx
```

Fine-grained Token 필요 권한:
- **Contents**: Read-only (또는 Read and write for draft releases)

### 4. GitHub Actions 워크플로우

```yaml
# .github/workflows/release.yml
on:
  push:
    tags: ['v*']

jobs:
  release:
    strategy:
      matrix:
        include:
          - platform: macos-latest
            args: --target aarch64-apple-darwin
          - platform: macos-latest
            args: --target x86_64-apple-darwin
    steps:
      - uses: tauri-apps/tauri-action@v0
        with:
          projectPath: schedule-ai-tauri
```

### 5. 모노레포 설정

```yaml
# pnpm-workspace.yaml
packages:
  - schedule-ai-tauri
  - schedule-ai-server
  - schedule-ai-web      # 추가
  - packages/*
```

```json
// package.json 스크립트 추가
{
  "dev:web": "pnpm --filter schedule-ai-web dev",
  "build:web": "pnpm --filter schedule-ai-web build"
}
```

### 6. 앱 아이콘 및 파비콘

Focus를 상징하는 아이콘 디자인. SVG로 제작 후 모든 플랫폼용으로 변환.

#### 아이콘 디자인

- **콘셉트**: 집중 타겟/포커스 링
- **스타일**: 보라색 그라데이션 배경 + 동심원 링 + 체크마크
- **의미**:
  - 동심원: 집중 타겟, Focus 모드 시각화
  - 체크마크: 태스크 완료 표시
  - 보라색: 집중력, 창의성 상징

#### 생성된 파일

| 플랫폼 | 파일 |
|--------|------|
| 소스 | `assets/app-icon.svg`, `assets/app-icon.png` (1024x1024) |
| macOS | `icon.icns` |
| Windows | `icon.ico`, `Square*.png` |
| Linux | `32x32.png`, `128x128.png`, `icon.png` |
| iOS | `icons/ios/AppIcon-*.png` |
| Android | `icons/android/mipmap-*/` |
| 웹 파비콘 | `favicon.ico`, `icon.png`, `apple-icon.png` |
| PWA | `icon-192.png`, `icon-512.png`, `icon.svg` |

#### 아이콘 생성 스크립트

```bash
# SVG → 1024x1024 PNG
node scripts/generate-master-icon.mjs

# Tauri 공식 아이콘 명령어 (모든 플랫폼)
cd schedule-ai-tauri && pnpm tauri icon ../assets/app-icon.png
```

### 7. 멀티 플랫폼 릴리즈 워크플로우

통합 릴리즈 + 매트릭스 빌드 전략 채택.

#### 데스크톱 (`.github/workflows/release.yml`)

태그 푸시 시 자동 빌드:
- macOS (Apple Silicon + Intel)
- Windows
- Linux (Ubuntu 22.04)
- `fail-fast: false` - 한 플랫폼 실패해도 다른 플랫폼 계속
- 워크스페이스 패키지 사전 빌드 (`@schedule-ai/core`, `@schedule-ai/llm-client`, `@schedule-ai/ui`)

#### 모바일 (`.github/workflows/release-mobile.yml`)

수동 트리거 (`workflow_dispatch`):
- iOS / Android / both 선택
- 앱스토어 심사 과정 때문에 분리

### 8. 빌드 이슈 해결

#### x86_64 macOS `BOOL` 타입 이슈

`focus/mod.rs`에서 `activateIgnoringOtherApps_` 호출 시 아키텍처별 타입 차이:

| 아키텍처 | `BOOL` 타입 |
|----------|-------------|
| aarch64 (Apple Silicon) | `bool` |
| x86_64 (Intel) | `i8` |

**해결**: `cocoa::base::YES` 상수 사용
```rust
use cocoa::base::YES;
app.activateIgnoringOtherApps_(YES);  // true 대신 YES 사용
```

### 9. 릴리즈 현황

| 버전 | 상태 | 플랫폼 |
|------|------|--------|
| v0.0.3 | Published | macOS, Windows, Linux |
| v0.0.2 | Published | macOS |
| v0.0.1 | Published | macOS |

## 파일 변경 목록

### 새로 생성
- `schedule-ai-web/` - Next.js 프로젝트 전체
- `.github/workflows/release.yml` - 데스크톱 릴리즈 워크플로우
- `.github/workflows/release-mobile.yml` - 모바일 릴리즈 워크플로우
- `docs/plans/09-website-distribution.md` - 설계 문서
- `assets/app-icon.svg` - 앱 아이콘 원본
- `assets/app-icon.png` - 1024x1024 마스터 PNG
- `scripts/generate-icons.mjs` - 웹 아이콘 생성 스크립트
- `scripts/generate-master-icon.mjs` - 마스터 PNG 생성 스크립트

### 수정
- `docs/plans/09-subscription-server.md` → `10-subscription-server.md` (넘버링 변경)
- `pnpm-workspace.yaml` - schedule-ai-web 추가
- `package.json` - 웹 개발 스크립트 추가, @resvg/resvg-js, sharp 추가
- `docs/ROADMAP.md` - Phase 7 완료 상태 반영
- `schedule-ai-tauri/src-tauri/icons/` - 모든 플랫폼 아이콘 교체
- `schedule-ai-web/src/app/favicon.ico` - 파비콘 교체
- `schedule-ai-web/src/app/icon.png` - 아이콘 추가
- `schedule-ai-web/src/app/apple-icon.png` - Apple Touch 아이콘 추가
- `schedule-ai-web/public/icon-*.png` - PWA 아이콘 추가
- `schedule-ai-web/src/components/Header.tsx` - 로고 아이콘 적용
- `schedule-ai-web/src/components/Footer.tsx` - 로고 아이콘 적용
- `schedule-ai-web/src/lib/github.ts` - Private 저장소 토큰 인증, Windows/Linux 다운로드 URL 추가
- `schedule-ai-web/src/lib/platform.ts` - 플랫폼 감지 유틸리티 (신규)
- `schedule-ai-web/src/app/[locale]/download/DownloadContent.tsx` - 플랫폼 자동 감지 UI
- `schedule-ai-web/messages/en.json` - 다운로드 페이지 번역 추가
- `schedule-ai-web/messages/ko.json` - 다운로드 페이지 번역 추가
- `schedule-ai-tauri/src-tauri/src/focus/mod.rs` - x86_64 BOOL 타입 수정

### 환경 설정
- `schedule-ai-web/.env.local` - GitHub Token 설정 (gitignore 됨)

## 기술 스택

| 영역 | 기술 |
|------|------|
| 웹 프레임워크 | Next.js 16 (App Router) |
| 스타일링 | Tailwind CSS |
| i18n | next-intl |
| 호스팅 | Vercel (예정) |
| CI/CD | GitHub Actions + tauri-action |
| API | GitHub Releases API |

## URL 라우팅

| URL | 설명 |
|-----|------|
| `/` | 브라우저 언어 기반 자동 리디렉션 |
| `/en` | 영어 랜딩 페이지 |
| `/ko` | 한국어 랜딩 페이지 |
| `/en/download` | 영어 다운로드 페이지 |
| `/ko/download` | 한국어 다운로드 페이지 |

### 광고 타겟팅 활용
- 한국 유저: `https://schedule-ai.com/ko`
- 글로벌 유저: `https://schedule-ai.com/en`

## 배포 가이드

### Vercel 배포
1. GitHub 저장소 연결
2. Root Directory: `schedule-ai-web`
3. 자동 배포 활성화

### 릴리즈 생성
```bash
git tag v0.1.0
git push --tags
# GitHub Actions가 자동으로 빌드 후 Draft Release 생성
```

---

시작일: 2026-01-01
완료일: 2026-01-01
상태: 완료
