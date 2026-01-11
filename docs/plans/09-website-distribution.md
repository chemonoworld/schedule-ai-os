# 09. 웹사이트 및 배포 시스템

## 개요

Schedule AI 데스크톱 앱의 공식 랜딩 페이지 및 배포 시스템 구축. 사용자가 웹사이트에서 앱을 다운로드하고, GitHub Actions를 통해 자동 빌드/릴리즈.

---

## 목적

- 공식 랜딩 페이지로 앱 홍보
- GitHub Releases를 통한 바이너리 배포
- CI/CD 파이프라인으로 빌드 자동화
- SEO 최적화로 검색 노출 개선

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 웹 프레임워크 | Next.js (App Router) |
| 스타일링 | Tailwind CSS |
| 호스팅 | Vercel |
| 바이너리 호스팅 | GitHub Releases |
| CI/CD | GitHub Actions + tauri-action |

---

## 프로젝트 구조

```
schedule-ai-web/
├── src/
│   ├── app/
│   │   ├── page.tsx           # 랜딩 페이지
│   │   ├── download/
│   │   │   └── page.tsx       # 다운로드 페이지
│   │   ├── layout.tsx         # 루트 레이아웃
│   │   └── globals.css
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── Hero.tsx
│   │   ├── Features.tsx
│   │   ├── Download.tsx
│   │   └── Footer.tsx
│   └── lib/
│       └── github.ts          # GitHub API 헬퍼
├── public/
│   ├── screenshots/           # 앱 스크린샷
│   └── icons/
├── package.json
├── next.config.js
├── tailwind.config.js
└── tsconfig.json
```

---

## 랜딩 페이지 구조

### 1. 히어로 섹션

- 앱 이름 및 태그라인
- 핵심 가치 제안: "ADHD 친화적 AI 일정 관리"
- 앱 스크린샷/목업
- Download CTA 버튼

### 2. 기능 섹션

- AI 플랜 파싱: 자연어로 계획 입력 → 구조화된 태스크
- 집중 모드: Hard Blocking으로 방해 앱 차단
- Progress Tracking: 히트맵, 연속 기록
- 다국어 지원: 영어/한국어

### 3. 다운로드 섹션

- macOS 다운로드 버튼
- 버전 정보 표시
- 시스템 요구사항
- (향후) Windows, Linux 플레이스홀더

### 4. 푸터

- GitHub 저장소 링크
- 문의/피드백
- (향후) 개인정보처리방침, 이용약관

---

## 다운로드 페이지 설계

### GitHub API 연동

```typescript
interface Release {
  tag_name: string;
  published_at: string;
  assets: Asset[];
}

interface Asset {
  name: string;
  browser_download_url: string;
  size: number;
}

export async function getLatestRelease(): Promise<{
  version: string;
  downloadUrl: string | null;
  publishedAt: string;
  size: number;
}> {
  const res = await fetch(
    'https://api.github.com/repos/OWNER/schedule-ai/releases/latest',
    { next: { revalidate: 3600 } } // 1시간 캐시
  );

  if (!res.ok) {
    throw new Error('Failed to fetch release');
  }

  const data: Release = await res.json();

  // macOS DMG 찾기
  const dmgAsset = data.assets.find((a) => a.name.endsWith('.dmg'));

  return {
    version: data.tag_name,
    downloadUrl: dmgAsset?.browser_download_url ?? null,
    publishedAt: data.published_at,
    size: dmgAsset?.size ?? 0,
  };
}
```

### 다운로드 버튼 컴포넌트

```tsx
export function DownloadButton() {
  const [release, setRelease] = useState<Release | null>(null);

  useEffect(() => {
    getLatestRelease().then(setRelease);
  }, []);

  if (!release) {
    return <LoadingButton />;
  }

  return (
    <a
      href={release.downloadUrl}
      className="btn-primary"
    >
      <AppleIcon />
      Download for macOS
      <span className="text-sm opacity-75">{release.version}</span>
    </a>
  );
}
```

---

## GitHub Actions 워크플로우

### .github/workflows/release.yml

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-latest
            args: --target aarch64-apple-darwin
          - platform: macos-latest
            args: --target x86_64-apple-darwin
    runs-on: ${{ matrix.platform }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install Rust
        uses: dtolnay/rust-action@stable

      - name: Install dependencies
        run: pnpm install

      - name: Build and Release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'Schedule AI ${{ github.ref_name }}'
          releaseBody: |
            ## What's Changed
            See the commits for details.

            ## Downloads
            - **macOS (Apple Silicon)**: `Schedule.AI_*_aarch64.dmg`
            - **macOS (Intel)**: `Schedule.AI_*_x64.dmg`
          releaseDraft: true
          prerelease: false
          projectPath: schedule-ai-tauri
          args: ${{ matrix.args }}
```

### 릴리즈 프로세스

1. 버전 태그 생성: `git tag v0.1.0`
2. 태그 푸시: `git push origin v0.1.0`
3. GitHub Actions 자동 실행
4. macOS aarch64, x86_64 빌드
5. Draft 릴리즈 생성
6. 검토 후 Publish

---

## Vercel 배포 설정

### 프로젝트 설정

- **Framework Preset**: Next.js
- **Root Directory**: `schedule-ai-web`
- **Build Command**: `pnpm build`
- **Output Directory**: `.next`

### 환경 변수 (선택)

```
GITHUB_TOKEN=ghp_xxx  # API rate limit 방지용 (선택)
```

### 커스텀 도메인

1. Vercel 대시보드에서 도메인 추가
2. DNS 레코드 설정
3. SSL 자동 발급

---

## 지원 플랫폼

| 플랫폼 | 상태 | 아키텍처 |
|--------|------|----------|
| macOS | 지원 | aarch64 (Apple Silicon), x86_64 (Intel) |
| Windows | 예정 | x86_64 |
| Linux | 예정 | x86_64 |

---

## 구현 상태

- [x] schedule-ai-web 프로젝트 생성
- [x] 랜딩 페이지 구현
- [x] 다운로드 페이지 구현
- [x] i18n 다국어 지원 (next-intl)
- [x] URL 기반 라우팅 (`/en`, `/ko`)
- [x] GitHub Actions 워크플로우 생성
- [x] 앱 아이콘 및 파비콘 제작
- [ ] Vercel 배포
- [ ] 커스텀 도메인 설정

---

## 추가 작업

### 1. 앱 아이콘 및 파비콘 ✅ 완료

집중(Focus)을 표현하는 아이콘 디자인. SVG 기반으로 제작 후 모든 플랫폼용으로 변환.

#### 아이콘 디자인

- **콘셉트**: 집중 타겟/포커스 링
- **스타일**: 보라색 그라디언트 배경 + 동심원 링 + 체크마크
- **의미**:
  - 동심원: 집중 타겟, Focus 모드 시각화
  - 체크마크: 태스크 완료 표시
  - 보라색: 집중력, 창의성 상징

#### 생성된 파일

| 플랫폼 | 파일 | 크기 |
|--------|------|------|
| **소스** | `assets/app-icon.svg` | 원본 |
| **소스** | `assets/app-icon.png` | 1024x1024 |
| **macOS** | `schedule-ai-tauri/src-tauri/icons/icon.icns` | 다중 레이어 |
| **Windows** | `schedule-ai-tauri/src-tauri/icons/icon.ico` | 16-256px |
| **Linux** | `schedule-ai-tauri/src-tauri/icons/*.png` | 32-512px |
| **iOS** | `schedule-ai-tauri/src-tauri/icons/ios/` | 20-512px (@1x-3x) |
| **Android** | `schedule-ai-tauri/src-tauri/icons/android/` | mipmap 디렉토리 |
| **웹 파비콘** | `schedule-ai-web/src/app/favicon.ico` | 16-256px |
| **웹 아이콘** | `schedule-ai-web/src/app/icon.png` | 32x32 |
| **Apple Touch** | `schedule-ai-web/src/app/apple-icon.png` | 180x180 |
| **PWA** | `schedule-ai-web/public/icon-192.png` | 192x192 |
| **PWA** | `schedule-ai-web/public/icon-512.png` | 512x512 |
| **SVG** | `schedule-ai-web/public/icon.svg` | 스케일러블 |

#### 아이콘 생성 스크립트

```bash
# 마스터 PNG 생성 (1024x1024)
node scripts/generate-master-icon.mjs

# 모든 플랫폼용 아이콘 생성
node scripts/generate-icons.mjs

# Tauri 공식 아이콘 명령어 (icns, ico 포함)
cd schedule-ai-tauri && pnpm tauri icon ../assets/app-icon.png
```

#### 파일 구조

```
schedule-ai/
├── assets/
│   ├── app-icon.svg       # 원본 SVG
│   └── app-icon.png       # 1024x1024 마스터 PNG
├── scripts/
│   ├── generate-icons.mjs
│   └── generate-master-icon.mjs
├── schedule-ai-web/
│   ├── src/app/
│   │   ├── favicon.ico
│   │   ├── icon.png
│   │   └── apple-icon.png
│   └── public/
│       ├── icon.svg
│       ├── icon-192.png
│       └── icon-512.png
└── schedule-ai-tauri/
    └── src-tauri/
        └── icons/
            ├── icon.icns         # macOS
            ├── icon.ico          # Windows
            ├── icon.png          # Linux (512x512)
            ├── 32x32.png
            ├── 64x64.png
            ├── 128x128.png
            ├── 128x128@2x.png
            ├── Square*.png       # Windows Store
            ├── StoreLogo.png
            ├── ios/              # iOS 아이콘셋
            └── android/          # Android mipmap
```

---

### 2. 멀티 플랫폼 릴리즈 전략 ✅ 결정됨

**결정: 통합 릴리즈 + 매트릭스 빌드**

- 데스크톱(macOS, Windows, Linux): 하나의 태그에 모든 플랫폼 바이너리 포함
- 모바일(iOS, Android): 별도 워크플로우 (앱스토어 심사 과정 때문)
- `fail-fast: false`로 한 플랫폼 실패해도 다른 플랫폼 계속 빌드

#### 구현된 워크플로우

- `.github/workflows/release.yml` - 데스크톱 (태그 푸시 시 자동)
- `.github/workflows/release-mobile.yml` - 모바일 (수동 트리거)

#### 통합 릴리즈 구조

하나의 버전 태그에 모든 플랫폼 바이너리 포함.

```
v0.1.0
├── Schedule.AI_0.1.0_aarch64.dmg      # macOS Apple Silicon
├── Schedule.AI_0.1.0_x64.dmg          # macOS Intel
├── Schedule.AI_0.1.0_x64-setup.exe    # Windows
├── Schedule.AI_0.1.0_amd64.deb        # Linux Debian
├── Schedule.AI_0.1.0_amd64.AppImage   # Linux AppImage
├── Schedule.AI_0.1.0.ipa              # iOS (TestFlight/App Store)
└── Schedule.AI_0.1.0.apk              # Android
```

**장점**:
- 버전 관리 단순화
- 사용자가 하나의 릴리즈 페이지에서 모든 플랫폼 다운로드
- 웹사이트 다운로드 페이지 구현 간단

**단점**:
- 빌드 시간이 길어짐 (모든 플랫폼 빌드 대기)
- 한 플랫폼 빌드 실패 시 전체 릴리즈 지연

#### 옵션 B: 플랫폼별 분리 릴리즈

플랫폼별로 별도 태그/릴리즈.

```
v0.1.0-desktop      # macOS, Windows, Linux
v0.1.0-mobile       # iOS, Android
```

또는

```
v0.1.0-macos
v0.1.0-windows
v0.1.0-linux
v0.1.0-ios
v0.1.0-android
```

**장점**:
- 플랫폼별 독립 릴리즈 사이클
- 빌드 실패 격리

**단점**:
- 버전 관리 복잡
- 다운로드 페이지 로직 복잡

#### ✅ 구현됨: 통합 릴리즈 + 매트릭스 빌드

데스크톱 릴리즈 워크플로우 (`.github/workflows/release.yml`):

```yaml
jobs:
  release:
    strategy:
      fail-fast: false  # 한 플랫폼 실패해도 다른 플랫폼 계속
      matrix:
        include:
          # macOS
          - platform: macos-latest
            args: --target aarch64-apple-darwin
          - platform: macos-latest
            args: --target x86_64-apple-darwin
          # Windows
          - platform: windows-latest
            args: ""
          # Linux
          - platform: ubuntu-22.04
            args: ""
```

모바일 릴리즈 워크플로우 (`.github/workflows/release-mobile.yml`):

```yaml
on:
  workflow_dispatch:  # 수동 트리거
    inputs:
      version:
        description: 'Version to release'
        required: true
      platform:
        type: choice
        options: [ios, android, both]
```

모바일은 앱스토어 심사 과정이 있으므로 별도 워크플로우로 분리.

---

### 3. 다운로드 페이지 플랫폼 감지

사용자 플랫폼을 자동 감지하여 적절한 다운로드 버튼 표시.

```typescript
// lib/platform.ts
export type Platform = 'macos' | 'windows' | 'linux' | 'ios' | 'android' | 'unknown';

export function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'unknown';

  const ua = navigator.userAgent.toLowerCase();

  if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
  if (ua.includes('android')) return 'android';
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('win')) return 'windows';
  if (ua.includes('linux')) return 'linux';

  return 'unknown';
}
```

```tsx
// 다운로드 페이지
const platform = detectPlatform();

return (
  <div>
    {/* 자동 감지된 플랫폼 우선 표시 */}
    <PrimaryDownload platform={platform} release={release} />

    {/* 다른 플랫폼 옵션 */}
    <OtherPlatforms currentPlatform={platform} release={release} />
  </div>
);
```

---

## 참고

- [Tauri Action](https://github.com/tauri-apps/tauri-action)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Vercel Documentation](https://vercel.com/docs)
- [GitHub Releases API](https://docs.github.com/en/rest/releases)

---

마지막 업데이트: 2026-01-01
