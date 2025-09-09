import { WebView } from 'react-native-webview';

/**
 * 토큰 검증 응답 콜백 타입
 */
type TokenVerificationCallback = (message: {
  type: 'RN_SET_TOKENS_SUCCESS' | 'RN_SET_TOKENS_FAILED' | 'RN_SET_TOKENS_ERROR';
  success: boolean;
  deviceId: string;
  user?: { id: string; email: string; loginMethod: string };
  error?: string;
  timestamp: number;
}) => void;

/**
 * 웹뷰 참조를 전역적으로 관리하는 매니저
 * 네이티브 앱에서 웹뷰로 메시지를 보낼 수 있게 해줍니다.
 */
class WebViewManager {
  private webViewRefs: Set<WebView> = new Set();
  private tokenVerificationCallbacks: Set<TokenVerificationCallback> = new Set();
  private isWebViewReady: boolean = false;
  private pendingTokenBroadcasts: Array<{ accessToken: string; deviceId: string; user?: { name: string; email: string } }> = [];

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
   * 모든 웹뷰에 토큰 설정 메시지를 전송합니다 (RN_SET_TOKENS).
   * 앱 시작 시 유효한 토큰이 있을 때 웹에 전달
   */
  broadcastSetTokens(accessToken: string, deviceId: string, user?: { name: string; email: string }) {
    // WebView가 준비되지 않았으면 대기열에 추가
    if (!this.isReady()) {
      console.log('⏳ WebView 준비 대기 중 - 토큰 브로드캐스트를 대기열에 추가');
      this.pendingTokenBroadcasts.push({ accessToken, deviceId, user });
      return;
    }

    // WebView가 준비되었으면 즉시 전송
    this.broadcastSetTokensImmediate(accessToken, deviceId, user);
  }

  /**
   * 웹뷰에 즉시 토큰을 전송합니다 (내부 메서드)
   */
  private broadcastSetTokensImmediate(accessToken: string, deviceId: string, user?: { name: string; email: string }) {
    const setTokensScript = `
      (function() {
        try {
          console.log('[Native] RN_SET_TOKENS 메시지 전송');
          
          const tokenData = {
            type: 'RN_SET_TOKENS',
            accessToken: '${accessToken}',
            deviceId: '${deviceId}',
            timestamp: Date.now()
          };
          
          ${user ? `tokenData.user = ${JSON.stringify(user)};` : ''}
          
          // 1. handleRNMessage 함수 호출 (웹 AuthContext 우선)
          if (typeof window.handleRNMessage === 'function') {
            console.log('[Native] handleRNMessage로 토큰 전송');
            window.handleRNMessage(tokenData);
          } else {
            console.log('[Native] handleRNMessage 없음, localStorage에 직접 저장');
            
            // 2. localStorage에 직접 저장 (폴백)
            localStorage.setItem('accessToken', '${accessToken}');
            localStorage.setItem('deviceId', '${deviceId}');
            
            ${user ? `localStorage.setItem('user', JSON.stringify(${JSON.stringify(user)}));` : ''}
            
            // 토큰 형식으로도 저장
            const tokens = {
              accessToken: '${accessToken}',
              expiresAt: Date.now() + 3600000 // 1시간 후
            };
            localStorage.setItem('tokens', JSON.stringify(tokens));
            
            // userStore 형식으로도 저장
            ${user ? `
            const userData = {
              id: '${user.email}',
              email: '${user.email}',
              name: '${user.name}',
              loginMethod: 'token_sync',
              lastLoginAt: Date.now()
            };
            localStorage.setItem('userData', JSON.stringify(userData));
            ` : ''}
          }
          
          // 3. window.postMessage로도 전송
          window.postMessage(tokenData, '*');
          
          // 4. custom event 발생
          window.dispatchEvent(new CustomEvent('RN_SET_TOKENS', { 
            detail: tokenData
          }));
          
          console.log('[Native] RN_SET_TOKENS 전송 완료');
        } catch (error) {
          console.error('[Native] RN_SET_TOKENS 전송 실패:', error);
        }
      })();
    `;
    
    console.log(`✅ Broadcasting RN_SET_TOKENS to ${this.webViewRefs.size} WebViews`);
    this.executeJavaScript(setTokensScript);
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
   * 토큰 검증 응답 콜백을 등록합니다.
   */
  registerTokenVerificationCallback(callback: TokenVerificationCallback) {
    this.tokenVerificationCallbacks.add(callback);
    console.log(`Token verification callback registered. Total: ${this.tokenVerificationCallbacks.size}`);
  }

  /**
   * 토큰 검증 응답 콜백을 해제합니다.
   */
  unregisterTokenVerificationCallback(callback: TokenVerificationCallback) {
    this.tokenVerificationCallbacks.delete(callback);
    console.log(`Token verification callback unregistered. Total: ${this.tokenVerificationCallbacks.size}`);
  }

  /**
   * 웹에서 토큰 검증 응답을 받았을 때 호출되는 메서드
   */
  handleTokenVerificationResponse(message: {
    type: 'RN_SET_TOKENS_SUCCESS' | 'RN_SET_TOKENS_FAILED' | 'RN_SET_TOKENS_ERROR';
    success: boolean;
    deviceId: string;
    user?: { id: string; email: string; loginMethod: string };
    error?: string;
    timestamp: number;
  }) {
    console.log(`Processing token verification response: ${message.type}`, message);
    
    this.tokenVerificationCallbacks.forEach((callback) => {
      try {
        callback(message);
      } catch (error) {
        console.warn('Token verification callback failed:', error);
      }
    });
  }

  /**
   * WebView가 준비되었음을 알립니다.
   */
  setWebViewReady() {
    console.log('✅ WebView 준비 완료 - 대기 중인 토큰 브로드캐스트 처리');
    this.isWebViewReady = true;
    
    // 대기 중인 토큰 브로드캐스트 처리
    this.processPendingTokenBroadcasts();
  }

  /**
   * WebView 준비 상태를 확인합니다.
   */
  isReady(): boolean {
    return this.isWebViewReady && this.webViewRefs.size > 0;
  }

  /**
   * 대기 중인 토큰 브로드캐스트를 처리합니다.
   */
  private processPendingTokenBroadcasts() {
    if (this.pendingTokenBroadcasts.length > 0) {
      console.log(`📤 대기 중인 토큰 브로드캐스트 ${this.pendingTokenBroadcasts.length}개 처리 중`);
      
      this.pendingTokenBroadcasts.forEach(({ accessToken, deviceId, user }) => {
        this.broadcastSetTokensImmediate(accessToken, deviceId, user);
      });
      
      this.pendingTokenBroadcasts = [];
      console.log('✅ 모든 대기 중인 토큰 브로드캐스트 처리 완료');
    }
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