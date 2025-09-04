import { WebView } from 'react-native-webview';

/**
 * 웹뷰 참조를 전역적으로 관리하는 매니저
 * 네이티브 앱에서 웹뷰로 메시지를 보낼 수 있게 해줍니다.
 */
class WebViewManager {
  private webViewRefs: Set<WebView> = new Set();

  /**
   * 웹뷰 참조를 등록합니다.
   */
  registerWebView(webView: WebView) {
    this.webViewRefs.add(webView);
    console.log(`WebView registered. Total: ${this.webViewRefs.size}`);
  }

  /**
   * 웹뷰 참조를 해제합니다.
   */
  unregisterWebView(webView: WebView) {
    this.webViewRefs.delete(webView);
    console.log(`WebView unregistered. Total: ${this.webViewRefs.size}`);
  }

  /**
   * 모든 등록된 웹뷰에 JavaScript를 실행합니다.
   */
  executeJavaScript(jsCode: string) {
    console.log(`Executing JavaScript on ${this.webViewRefs.size} WebViews:`, jsCode);
    this.webViewRefs.forEach((webView) => {
      try {
        webView.injectJavaScript(jsCode);
      } catch (error) {
        console.warn('Failed to inject JavaScript into WebView:', error);
      }
    });
  }

  /**
   * 모든 웹뷰에 로그아웃 메시지를 전송합니다.
   * @param skipRefresh - true일 경우 웹페이지 새로고침을 건너뜁니다
   */
  broadcastLogout(skipRefresh: boolean = false) {
    const logoutScript = `
      (function() {
        // 웹페이지에 로그아웃 이벤트 발생
        try {
          console.log('[Native] 로그아웃 처리 시작, skipRefresh:', ${skipRefresh});
          
          // 1. 웹에서 로그아웃 API 호출 (토큰이 있는 경우)
          const accessToken = localStorage.getItem('accessToken') || localStorage.getItem('tokens');
          if (accessToken && !${skipRefresh}) {
            console.log('[Native] 웹에서 로그아웃 API 호출');
            
            // API 호출을 위한 토큰 파싱
            let token = accessToken;
            try {
              const tokenData = JSON.parse(accessToken);
              if (tokenData.accessToken) {
                token = tokenData.accessToken;
              }
            } catch (e) {
              // accessToken이 이미 문자열이면 그대로 사용
            }
            
            // 로그아웃 API 호출
            fetch('/auth/logout', {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
              }
            }).then(response => {
              console.log('[Native] 웹 로그아웃 API 응답:', response.status);
            }).catch(error => {
              console.log('[Native] 웹 로그아웃 API 에러:', error.message);
            });
          }
          
          // 2. Custom event 방식 (skipRefresh 정보 포함)
          window.dispatchEvent(new CustomEvent('nativeLogout', { 
            detail: { 
              timestamp: Date.now(),
              skipRefresh: ${skipRefresh}
            } 
          }));
          
          // 3. 직접 함수 호출 방식
          if (typeof window.handleNativeLogout === 'function') {
            window.handleNativeLogout(${skipRefresh});
          }
          
          // 4. 로컬 스토리지 및 세션 스토리지 정리
          if (typeof localStorage !== 'undefined') {
            localStorage.clear();
          }
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.clear();
          }
          
          // 5. 쿠키 정리 (도메인 관련)
          document.cookie.split(";").forEach(function(c) { 
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
          });
          
          // 6. 페이지 새로고침 (skipRefresh가 false인 경우)
          if (!${skipRefresh}) {
            console.log('[Native] 로그아웃 후 페이지 새로고침');
            setTimeout(() => {
              window.location.reload();
            }, 500); // API 호출 완료를 위한 약간의 딜레이
          }
          
          console.log('[Native] 로그아웃 처리 완료, skipRefresh:', ${skipRefresh});
        } catch (error) {
          console.error('[Native] 로그아웃 처리 실패:', error);
        }
      })();
    `;
    
    this.executeJavaScript(logoutScript);
  }

  /**
   * 모든 웹뷰를 새로고침합니다.
   */
  reloadAllWebViews() {
    console.log(`Reloading ${this.webViewRefs.size} WebViews`);
    this.webViewRefs.forEach((webView) => {
      try {
        webView.reload();
      } catch (error) {
        console.warn('Failed to reload WebView:', error);
      }
    });
  }

  /**
   * 등록된 웹뷰 개수를 반환합니다.
   */
  getWebViewCount(): number {
    return this.webViewRefs.size;
  }
}

// 싱글톤 인스턴스
export const webViewManager = new WebViewManager();