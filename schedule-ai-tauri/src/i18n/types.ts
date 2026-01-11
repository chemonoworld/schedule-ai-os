// i18n 타입 정의
// 네임스페이스를 사용하므로 타입 체크를 느슨하게 설정
import 'i18next';

declare module 'i18next' {
  interface CustomTypeOptions {
    // 네임스페이스 간 전환을 허용하기 위해 returnNull, returnEmptyString 설정
    returnNull: false;
    returnEmptyString: false;
    // 엄격한 타입 체크 비활성화 (네임스페이스:키 형태 사용 시 필요)
    allowObjectInHTMLChildren: true;
  }
}
