import React, { useRef, useState, useEffect } from 'react';
import { Alert, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useAuth } from '@/hooks/useAuth';
import { setLastEmail, getDeviceInfo, getLastEmail } from '@/utils/secure';
import { fetchLoginOptionsWithDeviceId } from '@/utils/api';
import { useRouter } from 'expo-router';
import { webViewManager } from '@/utils/webview-manager';
import * as SecureUtils from '@/utils/secure';
import * as ApiUtils from '@/utils/api';

type AppWebViewProps = {
  url: string;
  style?: any;
};

const injectedJavaScript = `
  (function() {
    window.isReactNativeWebView = true;
    window.appInfo = { platform: 'ReactNative', version: '1.0.0' };
    
    function setupMessageBridge() {
      const isTopWindow = (window === window.top);
      function fwd(data){ try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(data)); } catch(e){} }
      
      // 기존 메시지 처리
      window.addEventListener('message', function(event){
        try { const d = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (d.type === 'BIOMETRIC_LOGIN_REQUEST' || d.type === 'PIN_LOGIN_REQUEST') fwd(d);
        } catch(_) {}
      });
      
      // 네이티브 로그아웃 이벤트 처리
      window.addEventListener('nativeLogout', function(event) {
        console.log('[WebView] Native logout event received:', event.detail);
        const skipRefresh = event.detail?.skipRefresh || false;
        
        try {
          // 웹페이지에서 로그아웃 처리를 담당하는 함수가 있다면 호출
          if (typeof window.handleLogout === 'function') {
            window.handleLogout();
          }
          // 또는 커스텀 로그아웃 이벤트 발생
          window.dispatchEvent(new CustomEvent('webLogout', { detail: { source: 'native' } }));
          
          // skipRefresh가 false일 때만 페이지 새로고침
          if (!skipRefresh) {
            console.log('[WebView] Refreshing page after logout');
            setTimeout(() => {
              window.location.reload();
            }, 100);
          } else {
            console.log('[WebView] Skipping refresh after logout (login failure case)');
          }
        } catch (error) {
          console.error('[WebView] Failed to handle native logout:', error);
        }
      });
      
      if (!isTopWindow && window.parent){
        window.requestBiometricLogin = function(){ window.parent.postMessage({ type:'BIOMETRIC_LOGIN_REQUEST', timestamp: Date.now() }, '*'); };
        window.requestPinLogin = function(){ window.parent.postMessage({ type:'PIN_LOGIN_REQUEST', timestamp: Date.now() }, '*'); };
      }
      if (isTopWindow){
        window.requestBiometricLogin = function(){ fwd({ type:'BIOMETRIC_LOGIN_REQUEST', timestamp: Date.now() }); };
        window.requestPinLogin = function(){ fwd({ type:'PIN_LOGIN_REQUEST', timestamp: Date.now() }); };
      }
      
      console.log('[WebView] Message bridge setup completed');
    }
    
    if (document.readyState === 'loading') { 
      document.addEventListener('DOMContentLoaded', setupMessageBridge); 
    } else { 
      setupMessageBridge(); 
    }
    true;
  })();
`;

export function AppWebView({ url, style }: AppWebViewProps) {
  const webViewRef = useRef<WebView>(null);
  const { biometricLogin, completeLogin, logout, setLastWebLoginMessage } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isProcessingLogin, setIsProcessingLogin] = useState(false);

  // 로딩 타임아웃 설정 (10초 후 강제로 로딩 상태 해제)
  const setLoadingWithTimeout = (loading: boolean) => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    
    setIsLoading(loading);
    
    if (loading) {
      loadingTimeoutRef.current = setTimeout(() => {
        console.log('WebView loading timeout - forcing loading state to false');
        setIsLoading(false);
      }, 10000);
    }
  };

  // 컴포넌트 언마운트 시 웹뷰 참조 해제
  useEffect(() => {
    return () => {
      if (webViewRef.current) {
        webViewManager.unregisterWebView(webViewRef.current);
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      // 전역 함수 정리
      // @ts-ignore
      if (global.webViewHandlePinLoginResult) {
        // @ts-ignore
        delete global.webViewHandlePinLoginResult;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  // 디바이스 정보 요청 처리
  const handleGetDeviceInfo = async () => {
    try {
      console.log('📱 디바이스 정보 수집 중...');
      // Alert.alert('시작', '디바이스 정보 수집을 시작합니다.');

      // getDeviceInfo 유틸리티 사용
      console.log('모듈 로드: getDeviceInfo 모듈이 로드되었습니다.');
      
      const deviceInfo = await SecureUtils.getDeviceInfo();
      // Alert.alert('수집 완료', `디바이스 정보 수집 완료\n${JSON.stringify(deviceInfo, null, 2)}`);

      console.log('✅ 디바이스 정보 수집 완료:', deviceInfo);

      // Alert로 디바이스 ID 표시
      // Alert.alert('디바이스 정보', `Device ID: ${deviceInfo.deviceId}\nPlatform: ${deviceInfo.platform}\nDevice Name: ${deviceInfo.deviceName}`);

      // package.json에서 버전 가져오기 - 하드코딩으로 변경
      const appVersion = '1.0.0';

      // 웹뷰로 디바이스 정보 전송 (앱 환경 정보)
      const response = {
        type: 'deviceInfo',
        deviceInfo: {
          deviceId: deviceInfo.deviceId,
          appVersion: appVersion,
          platform: deviceInfo.platform.toLowerCase() // 'ios' 또는 'android'
        }
      };

      const jsCode = `
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(${JSON.stringify(response)}));
        }
        if (window.handleDeviceInfoResult) { 
          window.handleDeviceInfoResult(${JSON.stringify(response)}); 
        }
        if (window.dispatchEvent) { 
          window.dispatchEvent(new CustomEvent('deviceInfo', { 
            detail: ${JSON.stringify(response)} 
          })); 
        }
        true;
      `;
      webViewRef.current?.injectJavaScript(jsCode);

    } catch (error) {
      console.error('❌ 디바이스 정보 수집 실패:', error);

      // package.json에서 버전 가져오기 - 하드코딩으로 변경
      const appVersion = '1.0.0';

      // 오류 시에도 기본값으로 응답
      const errorResponse = {
        type: 'deviceInfo',
        deviceInfo: {
          deviceId: 'unknown-device',
          appVersion: appVersion,
          platform: 'unknown'
        },
        error: '디바이스 정보를 가져올 수 없습니다.'
      };

      const errorJsCode = `
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(${JSON.stringify(errorResponse)}));
        }
        if (window.handleDeviceInfoResult) { 
          window.handleDeviceInfoResult(${JSON.stringify(errorResponse)}); 
        }
        true;
      `;
      webViewRef.current?.injectJavaScript(errorJsCode);
    }
  };

  // 메시지 큐 및 처리 상태
  const [messageQueue, setMessageQueue] = useState<any[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  const processMessageQueue = async (messages: any[]) => {
    console.log(`📦 Processing message queue with ${messages.length} messages`);
    
    // 로그인 실패 체크: loginFailure가 있으면 로그인 실패로 간주
    const hasLoginFailure = messages.some(msg => 
      (msg.type === 'loginFailure' && msg.success === false) ||
      (msg.type === 'pinLoginFailure' && msg.success === false) ||
      (msg.type === 'biometricLoginFailure' && msg.success === false)
    );
    
    // 디바이스 정보 요청 체크
    const hasDeviceInfoRequest = messages.some(msg => msg.type === 'getDeviceInfo');
    
    const shouldSkipRefresh = hasLoginFailure || hasDeviceInfoRequest;
    
    console.log(`🔍 Queue 처리 결과 - skipRefresh: ${shouldSkipRefresh} (loginFailure: ${hasLoginFailure}, deviceInfo: ${hasDeviceInfoRequest})`);
    
    // 로그인 실패가 있으면 logout 메시지들을 필터링
    const filteredMessages = hasLoginFailure 
      ? messages.filter(msg => {
          if (msg.type === 'logout') {
            console.log(`🚫 로그인 실패 감지로 logout 메시지 무시: ${JSON.stringify(msg)}`);
            return false;
          }
          return true;
        })
      : messages;
    
    console.log(`📝 처리할 메시지: ${filteredMessages.length}개 (원본: ${messages.length}개)`);
    
    // 각 메시지를 순차 처리 (새로고침 제외)
    for (const parsed of filteredMessages) {
      await processSingleMessage(parsed, true); // skipRefreshInMessage = true
    }
    
    // 모든 메시지 처리 후 새로고침 결정
    if (!shouldSkipRefresh) {
      console.log(`🔄 Queue 처리 완료 후 새로고침 실행`);
      setTimeout(() => {
        webViewRef.current?.reload();
      }, 100);
    } else {
      console.log(`🚫 Queue 처리 완료 - 새로고침 건너뛰기 (로그인 실패: ${hasLoginFailure}, 디바이스 정보: ${hasDeviceInfoRequest})`);
    }
  };

  const handleMessage = async (event: WebViewMessageEvent) => {
    try {
      console.log('🔥 WebView message received:', event?.nativeEvent?.data?.substring(0, 200) + '...');
      const data = event?.nativeEvent?.data;
      if (!data) {
        console.log('🔥 No data in WebView message');
        return;
      }
      const parsed = JSON.parse(data);
      if (!parsed || typeof parsed !== 'object') {
        console.log('🔥 Invalid parsed data:', typeof parsed);
        return;
      }
      console.log('🔥 Parsed WebView message type:', parsed.type);

      // 메시지를 큐에 추가
      const newQueue = [...messageQueue, parsed];
      setMessageQueue(newQueue);
      
      // 큐 처리가 진행 중이 아니면 처리 시작
      if (!isProcessingQueue) {
        setIsProcessingQueue(true);
        
        // 잠시 대기 후 큐 처리 (동시에 오는 메시지들을 모으기 위해)
        setTimeout(async () => {
          await processMessageQueue(newQueue);
          setMessageQueue([]);
          setIsProcessingQueue(false);
        }, 50);
      }
      
      return; // 개별 메시지 처리는 하지 않음
    } catch (e) {
      console.error('WebView message handling error:', e);
    }
  };

  // === 메시지 타입별 처리 메소드들 ===
  const handleDeviceInfoRequest = async () => {
    await handleGetDeviceInfo();
  };

  const handlePinLoginRequest = async (parsed: any) => {
    try {
      // 즉시 "진행 중" 응답을 웹에 전송하여 로딩 상태 해제
          const progressResponse = {
            type: 'pinLoginProgress',
            success: true,
            message: 'PIN 입력 화면으로 이동 중...'
          };
          
          const immediateJsCode = `
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify(${JSON.stringify(progressResponse)}));
            }
            if (window.handlePinLoginProgress) { 
              window.handlePinLoginProgress(${JSON.stringify(progressResponse)}); 
            }
            if (window.dispatchEvent) { 
              window.dispatchEvent(new CustomEvent('pinLoginProgress', { 
                detail: ${JSON.stringify(progressResponse)} 
              })); 
            }
            true;
          `;
          webViewRef.current?.injectJavaScript(immediateJsCode);
          
          // 1. 현재 로그인된 사용자 정보 확인
          // getLastEmail 사용
          const currentUserEmail = await SecureUtils.getLastEmail();

          if (!currentUserEmail) {
            // 에러: 로그인된 사용자 없음
            const errorResponse = {
              type: 'pinLoginError',
              success: false,
              error: '저장된 사용자 정보가 없습니다.\n먼저 일반 로그인을 해주세요.'
            };
            
            const errorJsCode = `
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify(${JSON.stringify(errorResponse)}));
              }
              if (window.handlePinLoginResult) { 
                window.handlePinLoginResult(${JSON.stringify(errorResponse)}); 
              }
              true;
            `;
            webViewRef.current?.injectJavaScript(errorJsCode);
            return;
          }

          // 2. 서버에서 PIN 설정 확인 (디바이스 기반)
          try {
            // getDeviceInfo, fetchLoginOptionsWithDeviceId 사용
            const deviceInfo = await SecureUtils.getDeviceInfo();
            const loginOptions = await ApiUtils.fetchLoginOptionsWithDeviceId(deviceInfo.deviceId);
            
            if (!loginOptions?.hasPin) {
              // 에러: PIN 설정 안됨 - 알림 표시
              Alert.alert(
                'PIN 설정 필요',
                'PIN이 설정되지 않았습니다.\n먼저 일반 로그인 후 마이페이지에서 PIN을 설정해주세요.',
                [{ text: '확인' }]
              );
              
              const errorResponse = {
                type: 'pinLoginError',  
                success: false,
                error: 'PIN이 설정되지 않았습니다.\n먼저 일반 로그인 후 마이페이지에서 PIN을 설정해주세요.'
              };
              
              const errorJsCode = `
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify(${JSON.stringify(errorResponse)}));
                }
                if (window.handlePinLoginResult) { 
                  window.handlePinLoginResult(${JSON.stringify(errorResponse)}); 
                }
                true;
              `;
              webViewRef.current?.injectJavaScript(errorJsCode);
              return;
            }
          } catch (optionsError) {
            // 로그인 옵션 확인 실패 시에도 PIN 로그인 시도 (서버에서 판단)
            console.warn('PIN login options check failed, proceeding with PIN login:', optionsError);
          }

          // 3. PIN 설정 확인됨 -> PIN unlock 화면으로 이동
          //console.log('PIN이 설정되어 있습니다. PIN unlock 화면으로 이동합니다.');
          
          // WebView 요청임을 알리는 메시지 설정
          setLastWebLoginMessage({ type: 'PIN_LOGIN_REQUEST', timestamp: Date.now() });
         // Alert.alert('PIN 로그인 요청', 'PIN_LOGIN_REQUEST 메시지를 설정하고 pin-unlock 화면으로 이동합니다.');
          
          router.push('/pin-unlock' as any);
          
          // PIN 로그인 완료를 감지하기 위한 전역 이벤트 리스너 설정
          const handlePinResult = (result: any) => {
            // 웹의 요구사항에 맞는 메시지 형태로 전송
            const response = result.success ? {
              type: 'pinLoginSuccess',
              success: true,
              accessToken: result.accessToken,
              refreshToken: result.refreshToken,
              expiresAt: result.expiresAt,
              user: result.user
            } : {
              type: 'pinLoginFailure',
              success: false,
              error: result.error
            };
            
            // webView.postMessage 형태로 웹에 전송
            const jsCode = `
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify(${JSON.stringify(response)}));
              }
              if (window.handlePinLoginResult) { 
                window.handlePinLoginResult(${JSON.stringify(response)}); 
              }
              if (window.dispatchEvent) { 
                window.dispatchEvent(new CustomEvent('pinLoginResult', { 
                  detail: ${JSON.stringify(response)} 
                })); 
              }
              true;
            `;
            webViewRef.current?.injectJavaScript(jsCode);
          };

          // 전역 함수로 결과 처리 함수 등록 (고유한 이름 사용)
          // @ts-ignore
          global.webViewHandlePinLoginResult = handlePinResult;
          
         // Alert.alert('PIN 핸들러 등록', 'handlePinLoginResult 함수가  등록되었습니다.');
        } catch (error) {
          console.error('PIN login request failed:', error);
          
          // 에러 발생 시에도 웹에 응답 전송
          const errorResponse = {
            type: 'pinLoginFailure',
            success: false,
            error: 'PIN 로그인 요청 처리 중 오류가 발생했습니다.'
          };
          
          const errorJsCode = `
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify(${JSON.stringify(errorResponse)}));
            }
            if (window.handlePinLoginResult) { 
              window.handlePinLoginResult(${JSON.stringify(errorResponse)}); 
            }
            true;
          `;
          webViewRef.current?.injectJavaScript(errorJsCode);
        }
        // PIN 로그인 요청 처리는 새로고침 불필요 (네비게이션으로 처리)
        return;
      }

      if (parsed.type === 'BIOMETRIC_LOGIN_REQUEST') {
        try {
          // 즉시 "진행 중" 응답을 웹에 전송하여 로딩 상태 해제
          const progressResponse = {
            type: 'biometricLoginProgress',
            success: true,
            message: '생체인증을 진행 중입니다...'
          };
          
          const immediateJsCode = `
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify(${JSON.stringify(progressResponse)}));
            }
            if (window.handleBiometricProgress) { 
              window.handleBiometricProgress(${JSON.stringify(progressResponse)}); 
            }
            if (window.dispatchEvent) { 
              window.dispatchEvent(new CustomEvent('biometricProgress', { 
                detail: ${JSON.stringify(progressResponse)} 
              })); 
            }
            true;
          `;
          webViewRef.current?.injectJavaScript(immediateJsCode);
          
          // 1. 현재 로그인된 사용자 정보 확인
          // getLastEmail 사용
          const currentUserEmail = await SecureUtils.getLastEmail();

          if (!currentUserEmail) {
            // 에러: 로그인된 사용자 없음
            const errorResponse = {
              type: 'biometricLoginError',
              success: false,
              error: '저장된 사용자 정보가 없습니다.\n먼저 일반 로그인을 해주세요.'
            };
            
            const errorJsCode = `
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify(${JSON.stringify(errorResponse)}));
              }
              if (window.handleBiometricResult) { 
                window.handleBiometricResult(${JSON.stringify(errorResponse)}); 
              }
              true;
            `;
            webViewRef.current?.injectJavaScript(errorJsCode);
            return;
          }

          // 2. 서버에서 생체인증 설정 확인 (디바이스 기반)
          try {
            // getDeviceInfo, fetchLoginOptionsWithDeviceId 사용
            const deviceInfo = await SecureUtils.getDeviceInfo();
            const loginOptions = await ApiUtils.fetchLoginOptionsWithDeviceId(deviceInfo.deviceId);
            
            if (!loginOptions?.hasPasskey) {
              // 에러: 생체인증 설정 안됨
              const errorResponse = {
                type: 'biometricLoginError',  
                success: false,
                error: '생체인증이 설정되지 않았습니다.\n마이페이지에서 생체인증을 먼저 설정해주세요.'
              };
              
              const errorJsCode = `
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify(${JSON.stringify(errorResponse)}));
                }
                if (window.handleBiometricResult) { 
                  window.handleBiometricResult(${JSON.stringify(errorResponse)}); 
                }
                true;
              `;
              webViewRef.current?.injectJavaScript(errorJsCode);
              return;
            }
          } catch (optionsError) {
            // 로그인 옵션 확인 실패 시에도 생체인증 시도 (서버에서 판단)
            console.warn('Login options check failed, proceeding with biometric login:', optionsError);
          }

          // 3. 모든 체크 통과 -> 생체인증 실행
          const result = await biometricLogin();
          
          // 웹의 요구사항에 맞는 메시지 형태로 전송
          const response = result.success ? {
            type: 'biometricLoginSuccess',
            success: true,
            accessToken: (result as any).accessToken,
            refreshToken: (result as any).refreshToken,
            expiresAt: (result as any).expiresAt,
            user: result.user
          } : {
            type: 'biometricLoginFailure',
            success: false,
            error: result.error
          };
          
          // webView.postMessage 형태로 웹에 전송
          const jsCode = `
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify(${JSON.stringify(response)}));
            }
            if (window.handleBiometricResult) { 
              window.handleBiometricResult(${JSON.stringify(response)}); 
            }
            if (window.dispatchEvent) { 
              window.dispatchEvent(new CustomEvent('biometricResult', { 
                detail: ${JSON.stringify(response)} 
              })); 
            }
            true;
          `;
          webViewRef.current?.injectJavaScript(jsCode);
        } catch (error) {
          console.error('Biometric login request failed:', error);
          
          // 에러 발생 시에도 웹에 응답 전송
          const errorResponse = {
            type: 'biometricLoginFailure',
            success: false,
            error: '생체인증 로그인 요청 처리 중 오류가 발생했습니다.'
          };
          
          const errorJsCode = `
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify(${JSON.stringify(errorResponse)}));
            }
            if (window.handleBiometricResult) { 
              window.handleBiometricResult(${JSON.stringify(errorResponse)}); 
            }
            true;
          `;
          webViewRef.current?.injectJavaScript(errorJsCode);
        }
        // 생체인증 요청 처리는 새로고침 불필요
        return;
      }

      if ((parsed.type === 'loginSuccess' || parsed.type === 'pinLoginSuccess' || parsed.type === 'biometricLoginSuccess') && parsed.success === true) {
        // 중복 처리 방지
        if (isProcessingLogin) {
          console.log('이미 로그인 처리 중입니다. 무시합니다.');
          return;
        }
        setIsProcessingLogin(true);
        
        try {
          if (parsed.user?.email) { 
            await setLastEmail(parsed.user.email); 
          }
          
          // 웹에서 전송하는 user 구조: { id: string; email: string; name?: string; loginMethod: string }
          const u = parsed.user && parsed.user.email
            ? { 
                name: parsed.user.name || parsed.user.email.split('@')[0] || 'User', 
                email: parsed.user.email 
              }
            : { name: 'User', email: 'user@example.com' };
          
          if (parsed.refreshToken) {
            await completeLogin({ refreshToken: parsed.refreshToken, user: u, accessToken: parsed.accessToken });
          }
        } catch (error) {
          console.error('로그인 처리 중 오류:', error);
        } finally {
          setIsProcessingLogin(false);
        }
        
        // 로그인된 사용자 정보 로깅
        console.log('로그인 성공:', {
          id: parsed.user?.id,
          name: parsed.user?.name,
          email: parsed.user?.email,
          loginMethod: parsed.user?.loginMethod,
          hasRefreshToken: !!parsed.refreshToken,
          hasAccessToken: !!parsed.accessToken,
          expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt).toLocaleString() : null
        });

        // 로그인 성공 처리 완료
        return;
      }

      if (isLoginFailure) {
       // Alert.alert('로그인 실패', parsed.error || '로그인에 실패했습니다');
        console.log('로그인 실패 - 새로고침 없이 처리 (입력 정보 유지)');
        
        
        // 로그인 실패는 절대 새로고침 하지 않음
        return;
      }

      // 웹에서 로그아웃 메시지 처리
      if (parsed.type === 'logout') {
        const isLogoutFromLoginFailure = parsed.reason === 'loginFailure';
        
        // 💡 NEW APPROACH: 로그인 실패 상황인지 추가 확인
        // loginFailure 메시지가 곧 올 예정인지 체크하기 위해 잠시 대기
        console.log(`웹에서 로그아웃 메시지 수신 - reason: ${parsed.reason}`);
        
        // 로그아웃 처리 (큐 방식에서는 더 이상 복잡한 대기 로직 불필요)
        
        try {
          if (isLogoutFromLoginFailure) {
            // 로그인 실패로 인한 로그아웃 - logout() 호출하지 않음
            console.log('로그인 실패로 인한 로그아웃 - 처리 건너뛰기');
          } else {
            // 수동 로그아웃 - 정상적인 로그아웃 처리
            await logout(false);
            console.log('수동 로그아웃 완료');
          }
        } catch (error) {
          console.error('App logout failed:', error);
          Alert.alert('오류', '로그아웃 처리 중 오류가 발생했습니다.');
        }
        return;
      }

      // 보안 설정 필요 메시지 처리
      if (parsed.type === 'securitySetupNeeded' && parsed.data) {
        const { hasPin, hasPasskey, email } = parsed.data;
        
        if (!hasPin && !hasPasskey) {
          Alert.alert(
            '보안 설정 안내',
            '더 안전한 로그인을 위해 PIN 또는 생체인증을 설정해보세요. 마이페이지에서 설정할 수 있습니다.',
            [
              { text: '나중에', style: 'cancel' },
              { text: '마이페이지로 이동', onPress: () => router.push('/(tabs)/my' as any) },
            ]
          );
        } else if (!hasPin) {
          Alert.alert(
            'PIN 설정 안내',
            'PIN을 추가로 설정하시면 더욱 편리하게 로그인할 수 있습니다.',
            [
              { text: '나중에', style: 'cancel' },
              { text: '설정하기', onPress: () => router.push('/(tabs)/my' as any) },
            ]
          );
        } else if (!hasPasskey) {
          Alert.alert(
            '생체인증 설정 안내',
            '생체인증을 추가로 설정하시면 더욱 빠르게 로그인할 수 있습니다.',
            [
              { text: '나중에', style: 'cancel' },
              { text: '설정하기', onPress: () => router.push('/(tabs)/my' as any) },
            ]
          );
        }
        return;
      }

      // 개별 메시지에서는 새로고침 하지 않음 (큐 처리에서 한꺼번에 처리)
      console.log(`✅ 개별 메시지 처리 완료: ${parsed.type}`);

    } catch (e) {
      console.error('Single message processing error:', e);
    }
  };

  return (
    <View style={[{ flex: 1 }, style]}>
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={{ flex: 1 }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        scalesPageToFit={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        injectedJavaScriptBeforeContentLoaded={injectedJavaScript}
        onMessage={handleMessage}
        onLoadStart={(syntheticEvent) => {
          console.log('WebView load start:', syntheticEvent.nativeEvent.url);
          setLoadingWithTimeout(true);
        }}
        onLoadEnd={(syntheticEvent) => {
          console.log('WebView load end:', syntheticEvent.nativeEvent.url);
          setLoadingWithTimeout(false);
          
          // 웹뷰 로드 완료 시 매니저에 등록
          if (webViewRef.current) {
            webViewManager.registerWebView(webViewRef.current);
          }
        }}
        onLoadProgress={(syntheticEvent) => {
          console.log('WebView load progress:', syntheticEvent.nativeEvent.progress);
          // 진행률이 95% 이상이면 로딩 상태 해제 (일부 페이지에서 onLoadEnd가 안 호출되는 경우 대비)
          if (syntheticEvent.nativeEvent.progress >= 0.95) {
            setLoadingWithTimeout(false);
          }
        }}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView error: ', nativeEvent);
          setLoadingWithTimeout(false);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView HTTP error: ', nativeEvent);
          setLoadingWithTimeout(false);
        }}
        onShouldStartLoadWithRequest={(req) => {
          console.log('WebView navigation request:', {
            url: req.url,
            navigationType: req.navigationType,
            isMainFrame: req.isMainFrame,
            target: (req as any).target
          });
          
          // 외부 앱으로 연결되는 링크만 차단
          if (/^(mailto:|tel:|sms:|intent:|market:|play-store:)/i.test(req.url)) {
            console.log('Blocking external app link:', req.url);
            return false;
          }
          
          // 새 창으로 열리는 링크만 차단 (일반 페이지 이동은 허용)
          if (req.navigationType === 'click' && (req as any).target === '_blank') {
            console.log('Blocking new window link:', req.url);
            return false;
          }
          
          console.log('Allowing navigation to:', req.url);
          // 모든 일반적인 웹 페이지 이동은 허용
          return true;
        }}
      />
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0b3b82" />
          <Text style={styles.loadingText}>페이지를 불러오는 중...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#0b3b82',
    textAlign: 'center',
  },
});

export default AppWebView;






