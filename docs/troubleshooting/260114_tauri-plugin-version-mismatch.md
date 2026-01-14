# Tauri Plugin Version Mismatch

## 현상
- 증상: `pnpm tauri dev` 실행 시 버전 불일치 에러 발생
- 재현 조건: Tauri 프로젝트 빌드 시도

## 에러 로그
```
Error Found version mismatched Tauri packages. Make sure the NPM package and Rust crate versions are on the same major/minor releases:
tauri-plugin-dialog (v2.5.0) : @tauri-apps/plugin-dialog (v2.4.2)
```

## 분석
- 추정 원인: Rust 크레이트와 NPM 패키지의 버전이 동기화되지 않음
  - Rust (`Cargo.toml`): `tauri-plugin-dialog = "2"` → v2.5.0 설치됨
  - NPM (`package.json`): `@tauri-apps/plugin-dialog: "^2.4.2"` → v2.4.2 설치됨
- 관련 코드:
  - `schedule-ai-tauri/src-tauri/Cargo.toml:22`
  - `schedule-ai-tauri/package.json:19`

## 해결 계획
1. NPM 패키지를 최신 버전으로 업데이트

## Tasks
- [x] 현재 설치된 버전 확인
- [x] NPM 패키지 업데이트

## 해결책
```bash
cd schedule-ai-tauri
pnpm update @tauri-apps/plugin-dialog
```

## 결과
- [x] 해결됨
- 최종 원인: NPM 패키지가 Rust 크레이트보다 낮은 버전으로 설치되어 있었음
- 적용된 수정: `pnpm update @tauri-apps/plugin-dialog`로 v2.5.0으로 업데이트

## 예방책
- Tauri 플러그인 업데이트 시 Rust와 NPM 양쪽 모두 버전을 맞춰야 함
- 정기적으로 `pnpm update`를 실행하여 패키지를 최신 상태로 유지
