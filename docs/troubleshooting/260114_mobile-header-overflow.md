# Mobile Header Overflow

## 현상
- 증상: schedule-ai-web에서 모바일 화면으로 볼 때 Header의 네비게이션 요소들(Features, GitHub 아이콘, Download 버튼, 언어 선택기)이 한 줄에 모두 표시되어 줄바꿈 발생
- 재현 조건: 모바일 기기 또는 좁은 화면(< 768px)에서 웹사이트 접속

## 분석
- 추정 원인: GitHub 버튼 추가 후 네비게이션 요소가 4개로 늘어나면서 모바일 화면 너비를 초과
- 관련 코드: `schedule-ai-web/src/components/Header.tsx`

## 해결 계획
1. 모바일용 햄버거 메뉴 구현
2. 데스크톱/모바일 네비게이션 분리

## Tasks
- [x] MenuIcon, CloseIcon 컴포넌트 추가
- [x] mobileMenuOpen 상태 관리 추가
- [x] 데스크톱 네비게이션에 `hidden md:flex` 적용
- [x] 모바일 햄버거 버튼 추가 (`md:hidden`)
- [x] AnimatePresence로 모바일 메뉴 애니메이션 적용
- [x] 모바일 메뉴 열릴 때 body 스크롤 방지

## 해결책
- 768px(md) 브레이크포인트 기준으로 반응형 처리
- 데스크톱: 기존 가로 네비게이션 유지
- 모바일: 햄버거 버튼 클릭 시 세로 드롭다운 메뉴 표시
- Framer Motion AnimatePresence로 부드러운 메뉴 전환 애니메이션

## 결과
- [x] 해결됨
- 최종 원인: 좁은 화면에서 네비게이션 요소가 너무 많아 레이아웃 붕괴
- 적용된 수정: `schedule-ai-web/src/components/Header.tsx` - 모바일 햄버거 메뉴 추가
