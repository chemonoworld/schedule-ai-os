/**
 * Deep Link 처리 훅
 * scheduleai:// URL 스키마를 통해 들어오는 요청을 처리합니다.
 */

import { useEffect } from 'react';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { useCalendarStore } from '../stores/calendarStore';

/**
 * Deep Link URL을 파싱하여 처리합니다.
 */
function handleDeepLink(url: string): void {
  console.log('Deep link received:', url);

  const { handleOAuthSuccess, handleOAuthError } = useCalendarStore.getState();

  try {
    // scheduleai://auth/calendar/success
    if (url.includes('auth/calendar/success')) {
      handleOAuthSuccess();
      return;
    }

    // scheduleai://auth/calendar/error?message=xxx
    if (url.includes('auth/calendar/error')) {
      // URL 파싱
      const urlObj = new URL(url);
      const errorMessage = urlObj.searchParams.get('message') || 'OAuth failed';
      handleOAuthError(decodeURIComponent(errorMessage));
      return;
    }

    // 기타 deep link 처리 (추후 확장 가능)
    console.log('Unknown deep link:', url);
  } catch (error) {
    console.error('Failed to handle deep link:', error);
    handleOAuthError('Failed to process authentication response');
  }
}

/**
 * Deep Link 리스너를 설정하는 훅
 * App.tsx 또는 최상위 컴포넌트에서 사용합니다.
 */
export function useDeepLink(): void {
  useEffect(() => {
    // Tauri deep link 이벤트 리스너 설정
    const setupDeepLink = async () => {
      try {
        const unlisten = await onOpenUrl((urls) => {
          // 배열로 여러 URL이 올 수 있음
          for (const url of urls) {
            handleDeepLink(url);
          }
        });

        // 컴포넌트 언마운트 시 리스너 해제
        return unlisten;
      } catch (error) {
        console.error('Failed to setup deep link listener:', error);
      }
    };

    let unlisten: (() => void) | undefined;

    setupDeepLink().then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);
}

export default useDeepLink;
