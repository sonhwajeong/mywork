import { useState, useRef, useEffect } from 'react';
import { View, Alert } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { setLastEmail, getLastEmail, getDeviceInfo } from '@/utils/secure';
import { fetchLoginOptionsWithDeviceId } from '@/utils/api';
import { webViewManager } from '@/utils/webview-manager';

interface AppWebViewProps {
  url: string;
  style?: any;
}

export default function AppWebView({ url, style }: AppWebViewProps) {
  const webViewRef = useRef<WebView>(null);
  const router = useRouter();
  const { completeLogin, logout, biometricLogin, setLastWebLoginMessage, token, user } = useAuth();
  
  const [isProcessingLogin, setIsProcessingLogin] = useState(false);
  const [messageQueue, setMessageQueue] = useState<any[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  // === 공통 유틸리티: 웹으로 메시지 주입 ===
  const sendToWeb = (message: any, options?: { callback?: string; eventName?: string }) => {
    const { callback, eventName } = options || {};
    const js = `
      (function(){
        if (typeof window.handleRNMessage === 'function') {
          window.handleRNMessage(${JSON.stringify(message)});
        }
        window.postMessage(${JSON.stringify(message)}, '*');
        ${callback ? `if (window.${callback}) { window.${callback}(${JSON.stringify(message)}); }` : ''}
        ${eventName ? `if (window.dispatchEvent) { window.dispatchEvent(new CustomEvent('${eventName}', { detail: ${JSON.stringify(message)} })); }` : ''}
        true;
      })();
    `;
    webViewRef.current?.injectJavaScript(js);
  };

  // === 공통 유틸리티: 진행/오류 메시지 빌더 ===
  const buildProgress = (kind: 'pin' | 'biometric', message: string) => ({
    type: `${kind}LoginProgress`,
    success: true,
    message
  });

  const buildError = (kind: 'pin' | 'biometric', message: string) => ({
    type: `${kind}LoginError`,
    success: false,
    error: message
  });

  // === 공통 유틸리티: 디바이스 옵션 확인(hasPin/hasPasskey) ===
  const ensureOptionEnabled = async (kind: 'pin' | 'biometric'): Promise<boolean> => {
    try {
      const deviceInfo = await getDeviceInfo();
      const loginOptions = await fetchLoginOptionsWithDeviceId(deviceInfo.deviceId);

      const enabled = kind === 'pin' ? !!loginOptions?.hasPin : !!loginOptions?.hasPasskey;
      if (!enabled) {
        const title = kind === 'pin' ? 'PIN 설정 필요' : '생체인증 설정 필요';
        const msg = kind === 'pin'
          ? 'PIN이 설정되지 않았습니다.\n먼저 일반 로그인 후 마이페이지에서 PIN을 설정해주세요.'
          : '생체인증이 설정되지 않았습니다.\n마이페이지에서 생체인증을 먼저 설정해주세요.';
        Alert.alert(title, msg, [{ text: '확인' }]);

        const errorResponse = buildError(kind, msg);
        const callback = kind === 'pin' ? 'handlePinLoginResult' : 'handleBiometricResult';
        sendToWeb(errorResponse, { callback });
        return false;
      }
      return true;
    } catch (optionsError) {
      // 옵션 확인 실패 시에도 시도를 계속함(서버에서 최종 판단)
      console.warn(`${kind.toUpperCase()} login options check failed, proceeding:`, optionsError);
      return true;
    }
  };

  // 설정 완료 핸들러 등록 (PIN, 생체인증 등) + WebView 매니저 등록
  useEffect(() => {
    (global as any).webViewHandleSettingComplete = (result: any) => {
      console.log('⚙️ 설정 완료 결과 수신:', JSON.stringify(result));
      
      // WebView에 설정 완료 메시지 전송하고 새로고침
      const jsCode = `
        console.log('[설정 완료] 새로고침 실행');
        setTimeout(() => {
          window.location.reload();
        }, 100);
        true;
      `;
      webViewRef.current?.injectJavaScript(jsCode);
    };

    // 컴포넌트 언마운트 시 핸들러 정리
    return () => {
      delete (global as any).webViewHandlePinLoginResult;
      delete (global as any).webViewHandleBiometricLoginResult;
      delete (global as any).webViewHandleSettingComplete;
    };
  }, []);

  // WebView 매니저에 등록/해제 (컴포넌트 언마운트 시에만)
  useEffect(() => {
    const webView = webViewRef.current;
    return () => {
      if (webView) {
        console.log('📝 WebView 매니저에서 해제');
        webViewManager.unregisterWebView(webView);
      }
    };
  }, []);

  // WebView 로딩 완료 시 매니저에 등록
  const handleLoadEnd = () => {
    const webView = webViewRef.current;
    if (webView) {
      console.log('📝 WebView 매니저에 등록 (로딩 완료)');
      webViewManager.registerWebView(webView);
    }
  };

  // === 메시지 타입별 처리 메소드들 ===
  
  const handleGetDeviceInfo = async () => {
    try {
      console.log('📱 디바이스 정보 수집 중...');
      
      // getDeviceInfo 유틸리티 사용
      console.log('모듈 로드: getDeviceInfo 모듈이 로드되었습니다.');
      
      const deviceInfo = await getDeviceInfo();
      console.log('✅ 디바이스 정보 수집 완료:', deviceInfo);

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

      sendToWeb(response, { callback: 'handleDeviceInfoResult', eventName: 'deviceInfo' });
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

      sendToWeb(errorResponse, { callback: 'handleDeviceInfoResult' });
    }
  };

  const handlePinLoginRequest = async (parsed: any) => {
    console.log('🔐 PIN 로그인 요청 처리');
    
    try {
      // 즉시 "진행 중" 응답을 웹에 전송하여 로딩 상태 해제
      const progressResponse = buildProgress('pin', 'PIN 입력 화면으로 이동 중...');
      sendToWeb(progressResponse, { callback: 'handlePinLoginProgress', eventName: 'pinLoginProgress' });
      
      // 1. 현재 로그인된 사용자 정보 확인
      const currentUserEmail = await getLastEmail();

      if (!currentUserEmail) {
        // 에러: 로그인된 사용자 없음
        const errorResponse = buildError('pin', '저장된 사용자 정보가 없습니다.\n먼저 일반 로그인을 해주세요.');
        sendToWeb(errorResponse, { callback: 'handlePinLoginResult' });
        return;
      }

      // 2. 서버에서 PIN 설정 확인 (디바이스 기반)
      const pinEnabled = await ensureOptionEnabled('pin');
      if (!pinEnabled) return;

      // 3. PIN 설정 확인됨 -> PIN unlock 화면으로 이동
      // WebView 요청임을 알리는 메시지 설정
      setLastWebLoginMessage({ type: 'PIN_LOGIN_REQUEST', timestamp: Date.now() });
      
      router.push('/pin-unlock' as any);
      
      // PIN 로그인 완료를 감지하기 위한 전역 이벤트 리스너 설정
      const handlePinResult = (result: any) => {
        console.log('🎯 AppWebView에서 PIN 결과 받음:', result);
        console.log('🔍 PIN 핸들러 호출 시점 상태:', {
          webViewRefExists: !!webViewRef.current,
          resultType: typeof result,
          resultSuccess: result?.success
        });
        
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
        
        console.log('🚀 AppWebView에서 웹으로 전송할 응답:', response);
        
        // 웹에 직접 메시지 전달
        console.log('💉 JavaScript 코드 주입 시작');
        sendToWeb(response);
        console.log('✅ JavaScript 코드 주입 완료');
      };

      // 전역 함수로 결과 처리 함수 등록 (고유한 이름 사용)
      console.log('PIN 로그인 핸들러 등록');
      (global as any).webViewHandlePinLoginResult = handlePinResult;
      
      // 디버깅: 핸들러 등록 확인
      console.log('🔍 PIN 핸들러 등록 상태:', {
        handlerExists: !!(global as any).webViewHandlePinLoginResult,
        handlerType: typeof (global as any).webViewHandlePinLoginResult
      });
      
    } catch (error) {
      console.error('PIN 로그인 요청 처리 실패:', error);
      
      const errorResponse = { type: 'pinLoginFailure', success: false, error: 'PIN 로그인 요청 처리 중 오류가 발생했습니다.' };
      sendToWeb(errorResponse, { callback: 'handlePinLoginResult' });
    }
  };

  const handleBiometricLoginRequest = async () => {
    console.log('👆 생체인증 로그인 요청 처리');
    
    try {
      // 즉시 "진행 중" 응답을 웹에 전송하여 로딩 상태 해제
      const progressResponse = buildProgress('biometric', '생체인증을 진행 중입니다...');
      sendToWeb(progressResponse, { callback: 'handleBiometricProgress', eventName: 'biometricProgress' });
      
      // 1. 현재 로그인된 사용자 정보 확인
      const currentUserEmail = await getLastEmail();

      if (!currentUserEmail) {
        // 에러: 로그인된 사용자 없음
        const errorResponse = buildError('biometric', '저장된 사용자 정보가 없습니다.\n먼저 일반 로그인을 해주세요.');
        sendToWeb(errorResponse, { callback: 'handleBiometricResult' });
        return;
      }

      // 2. 서버에서 생체인증 설정 확인 (디바이스 기반)
      const biometricEnabled = await ensureOptionEnabled('biometric');
      if (!biometricEnabled) return;

      // 3. 모든 체크 통과 -> 생체인증 실행 (AppWebView_old와 동일)
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
      
      // 웹에 직접 메시지 전달
      console.log('📤 생체인증 결과를 웹에 전송:', response);
      
      sendToWeb(response);
      
    } catch (error) {
      console.error('생체인증 로그인 요청 처리 실패:', error);
      
      const errorResponse = { type: 'biometricLoginFailure', success: false, error: '생체인증 로그인 요청 처리 중 오류가 발생했습니다.' };
      sendToWeb(errorResponse);
    }
  };

  const handleLoginSuccess = async (parsed: any) => {
    console.log('✅ 로그인 성공 처리 시작:', JSON.stringify(parsed));
    if (isProcessingLogin) {
      console.log('⚠️ 이미 로그인 처리 중입니다. 무시됩니다.');
      return;
    }
    
    setIsProcessingLogin(true);
    try {
      // 1. 사용자 이메일을 저장 (기존 로직과 동일)
      if (parsed.user?.email) { 
        await setLastEmail(parsed.user.email); 
        console.log('📧 사용자 이메일 저장 완료:', parsed.user.email);
      }
      
      // 2. 웹에서 전송하는 user 구조: { id: string; email: string; name?: string; loginMethod: string }
      const user = parsed.user && parsed.user.email
        ? { 
            name: parsed.user.name || parsed.user.email.split('@')[0] || 'User', 
            email: parsed.user.email 
          }
        : { name: 'User', email: 'user@example.com' };
      
      console.log('🔄 사용자 정보 처리:', user);
      
      // 3. completeLogin 호출 (refreshToken이 있는 경우)
      if (parsed.refreshToken) {
        console.log('🔄 completeLogin 호출 중...');
        await completeLogin({ 
          refreshToken: parsed.refreshToken, 
          user: user, 
          accessToken: parsed.accessToken 
        });
        console.log('✅ completeLogin 완료');
      } else {
        console.log('⚠️ refreshToken이 없어서 completeLogin을 호출하지 않습니다.');
      }
      
      // 4. 웹의 AuthContext handleRNMessage를 통해 토큰 저장 처리
      // 중복 localStorage 저장 로직 제거 - 웹의 AuthContext가 처리함
      const loginMessage = {
        type: 'loginSuccess', // 웹의 일반 로그인으로 처리
        success: true,
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        expiresAt: parsed.expiresAt,
        user: {
          id: user.email,
          email: user.email,
          name: user.name,
          loginMethod: parsed.user?.loginMethod || 'email'
        }
      };

      // 웹의 handleRNMessage를 통해 처리 (웹 AuthContext가 설정한 함수 사용)
      const jsCode = `
        try {
          console.log('[WebView] 웹의 handleRNMessage 호출하여 로그인 처리');
          if (typeof window.handleRNMessage === 'function') {
            window.handleRNMessage(${JSON.stringify(loginMessage)});
            console.log('[WebView] ✅ 웹의 handleRNMessage로 로그인 처리 완료');
          } else {
            console.warn('[WebView] ⚠️ 웹의 handleRNMessage가 아직 설정되지 않음 - 직접 localStorage 저장');
            // 폴백: 웹 AuthContext가 아직 로드되지 않은 경우
            localStorage.setItem('accessToken', '${parsed.accessToken}');
            localStorage.setItem('refreshToken', '${parsed.refreshToken}');
            localStorage.setItem('expiresAt', '${parsed.expiresAt}');
            localStorage.setItem('user', JSON.stringify(${JSON.stringify(user)}));
            
            const tokenData = {
              accessToken: '${parsed.accessToken}',
              refreshToken: '${parsed.refreshToken}',
              expiresAt: ${parsed.expiresAt}
            };
            localStorage.setItem('tokens', JSON.stringify(tokenData));
            
            const userData = {
              id: '${user.email}',
              email: '${user.email}',
              name: '${user.name}',
              loginMethod: 'email',
              lastLoginAt: Date.now()
            };
            localStorage.setItem('userData', JSON.stringify(userData));
            console.log('[WebView] ✅ 폴백으로 localStorage 저장 완료');
          }
        } catch (e) {
          console.error('[WebView] 웹 로그인 처리 실패:', e);
        }
        true;
      `;
      webViewRef.current?.injectJavaScript(jsCode);
      
      // Old 버전과 동일하게 웹에 별도 메시지 전송하지 않음 (새로고침으로만 처리)
      console.log('🔄 토큰 저장 후 새로고침으로 처리');
      
      // 5. 로그인된 사용자 정보 상세 로깅 (기존과 동일)
      console.log('로그인 성공:', {
        id: parsed.user?.id,
        name: parsed.user?.name,
        email: parsed.user?.email,
        loginMethod: parsed.user?.loginMethod,
        hasRefreshToken: !!parsed.refreshToken,
        hasAccessToken: !!parsed.accessToken,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt).toLocaleString() : null
      });
      
    } catch (error) {
      console.error('❌ 로그인 처리 중 오류:', error);
    } finally {
      setIsProcessingLogin(false);
      console.log('🔄 isProcessingLogin = false로 설정');
    }
  };

  const handleLoginFailure = async (parsed: any) => {
    console.log('❌ 로그인 실패 처리:', parsed.error);
    
    // 로그인 실패 타입별 메시지 설정
    let title = '로그인 실패';
    let message = parsed.error || '로그인에 실패했습니다.';
    
    if (parsed.type === 'pinLoginFailure') {
      title = 'PIN 로그인 실패';
      message = parsed.error || 'PIN이 올바르지 않습니다.';
    } else if (parsed.type === 'biometricLoginFailure') {
      title = '생체인증 실패';
      message = parsed.error || '생체인증에 실패했습니다.';
    }
    
    // Alert 표시
    Alert.alert(title, message, [
      { text: '확인', style: 'default' }
    ]);
  };

  const handleLogoutRequest = async (parsed: any) => {
    console.log('🚪 로그아웃 요청 처리');
    const isLogoutFromLoginFailure = parsed.reason === 'loginFailure';
    
    if (isLogoutFromLoginFailure) {
      console.log('로그인 실패로 인한 로그아웃 - 처리 건너뛰기');
      return;
    }
    
    try {
      await logout(false); // 정상 로그아웃은 새로고침 허용
      console.log('로그아웃 완료');
    } catch (error) {
      console.error('로그아웃 실패:', error);
      Alert.alert('오류', '로그아웃 처리 중 오류가 발생했습니다.');
    }
  };

  const handleSecuritySetupNeeded = async (parsed: any) => {
    console.log('🔒 보안 설정 안내 처리');
    const { hasPin, hasPasskey } = parsed.data;
    
    if (!hasPin && !hasPasskey) {
      Alert.alert(
        '보안 설정 안내',
        '더 안전한 로그인을 위해 PIN 또는 생체인증을 설정해보세요.',
        [
          { text: '나중에', style: 'cancel' },
          { text: '마이페이지로 이동', onPress: () => router.push('/(tabs)/my' as any) },
        ]
      );
    }
  };

  const handleBiometricSetupComplete = async (parsed: any) => {
    console.log('🎉 생체인증 설정 완료 처리');
    
    // 설정 완료 알림 (선택사항)
    if (parsed.success) {
      console.log('생체인증 설정 완료 - WebView 새로고침 예정');
      
      // WebView 새로고침
      setTimeout(() => {
        webViewRef.current?.reload();
      }, 100);
    }
  };

  // === 메시지 큐 처리 ===
  
  const processMessageQueue = async (messages: any[]) => {
    console.log(`📦 메시지 큐 처리 시작: ${messages.length}개`);
    
    // 새로고침을 하지 않을 메시지 타입들 체크 (로그인 실패와 디바이스 정보 요청만)
    const hasLoginFailure = messages.some(msg => 
      (msg.type === 'loginFailure' && msg.success === false) ||
      (msg.type === 'pinLoginFailure' && msg.success === false) ||
      (msg.type === 'biometricLoginFailure' && msg.success === false)
    );
    
    const hasDeviceInfoRequest = messages.some(msg => msg.type === 'getDeviceInfo');
    const shouldSkipRefresh = true;//hasLoginFailure || hasDeviceInfoRequest;
    
    console.log(`🔍 새로고침 결정: skip=${shouldSkipRefresh} (실패=${hasLoginFailure}, 디바이스=${hasDeviceInfoRequest})`);
    
    // 로그인 실패 시 logout 메시지 필터링
    const filteredMessages = hasLoginFailure 
      ? messages.filter(msg => {
          if (msg.type === 'logout') {
            console.log('🚫 로그인 실패로 logout 메시지 무시');
            return false;
          }
          return true;
        })
      : messages;
    
    // 각 메시지 처리
    for (const message of filteredMessages) {
      await processSingleMessage(message);
    }
    
    // 새로고침 결정
    if (!shouldSkipRefresh) {
      console.log('🔄 새로고침 실행');
      // PIN 로그인 성공의 경우 웹에 메시지를 보낼 시간을 충분히 준 후 새로고침
      const hasPinLoginSuccess = messages.some(msg => msg.type === 'pinLoginSuccess' && msg.success === true);
      const refreshDelay = hasPinLoginSuccess ? 500 : 100; // PIN 로그인 성공시 500ms 대기
      
      console.log(`🔄 새로고침 지연: ${refreshDelay}ms (PIN 로그인: ${hasPinLoginSuccess})`);
      setTimeout(() => webViewRef.current?.reload(), refreshDelay);
    } else {
      console.log('🚫 새로고침 건너뛰기');
    }
  };

  const processSingleMessage = async (parsed: any) => {
    try {
      switch (parsed.type) {
        case 'getDeviceInfo':
          await handleGetDeviceInfo();
          break;
          
        case 'PIN_LOGIN_REQUEST':
          await handlePinLoginRequest(parsed);
          break;
          
        case 'BIOMETRIC_LOGIN_REQUEST':
          await handleBiometricLoginRequest();
          break;
          
        case 'loginSuccess':
        case 'pinLoginSuccess':
        case 'biometricLoginSuccess':
          if (parsed.success === true || parsed.type === 'loginSuccess') {
            console.log(`🎉 로그인 성공 메시지 처리: ${parsed.type}`, JSON.stringify(parsed));
            await handleLoginSuccess(parsed);
          } else {
            console.log(`⚠️ 로그인 성공 메시지이지만 success가 true가 아님: ${parsed.success}`);
          }
          break;
          
        case 'loginFailure':
        case 'pinLoginFailure':
        case 'biometricLoginFailure':
          if (parsed.success === false) {
            // 로그인 실패는 새로고침 없이 처리 (입력 정보 유지)
            console.log('로그인 실패 - 새로고침 없이 처리 (입력 정보 유지)');
            await handleLoginFailure(parsed);
          }
          break;
          
        case 'logout':
          await handleLogoutRequest(parsed);
          break;
          
        case 'securitySetupNeeded':
          await handleSecuritySetupNeeded(parsed);
          break;
          
        case 'biometricSetupComplete':
        case 'passkeySetupComplete':
          await handleBiometricSetupComplete(parsed);
          break;
          
        case 'RN_UPDATE_AUTH_STATE':
          // 웹에서 로그인 성공 시 RN 앱 상태 업데이트
          console.log('🔄 RN 앱 인증 상태 업데이트 요청:', parsed);
          try {
            if (parsed.refreshToken && parsed.user) {
              await completeLogin({
                refreshToken: parsed.refreshToken,
                accessToken: parsed.accessToken,
                user: {
                  name: parsed.user.name || parsed.user.email || 'User',
                  email: parsed.user.email || 'user@example.com'
                }
              });
              console.log('✅ RN 앱 인증 상태 업데이트 완료');
            }
          } catch (error) {
            console.error('❌ RN 앱 인증 상태 업데이트 실패:', error);
          }
          break;
          
        default:
          console.log(`⚠️ 알려지지 않은 메시지 타입: ${parsed.type}`);
      }
    } catch (error) {
      console.error(`메시지 처리 오류 (${parsed.type}):`, error);
    }
  };

  // === 메인 메시지 핸들러 ===
  
  const handleMessage = async (event: WebViewMessageEvent) => {
    try {
      const data = event?.nativeEvent?.data;
      if (!data) return;
      
      const parsed = JSON.parse(data);
      console.log('📨 WebView 메시지:', parsed.type);
      
      // 메시지를 큐에 추가
      const newQueue = [...messageQueue, parsed];
      setMessageQueue(newQueue);
      
      // 큐 처리
      if (!isProcessingQueue) {
        setIsProcessingQueue(true);
        setTimeout(async () => {
          await processMessageQueue(newQueue);
          setMessageQueue([]);
          setIsProcessingQueue(false);
        }, 50);
      }
    } catch (error) {
      console.error('메시지 처리 오류:', error);
    }
  };

  // === JSX 렌더링 ===

  const injectedJavaScript = `
    (function() {
      const fwd = function(d) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(d));
        }
      };

      const isTopWindow = (window === window.top);
      
      // WebView 인스턴스 고유 ID 생성 및 로깅
      const webViewInstanceId = 'webview_' + Math.random().toString(36).substr(2, 9);


      // RN 앱의 토큰 상태를 localStorage에 동기화
      const syncTokensFromRN = ${JSON.stringify({
        token: token,
        user: user
      })};

      // RN에서 보낸 메시지를 받는 이벤트 리스너 설정
      window.addEventListener('message', function(event) {
        try {
          if (event.source === window) return; // 자기 자신에게서 온 메시지 무시
          
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (data && data.type) {
            console.log('📬 Window message received:', data.type);
            window.handleRNMessage(data);
          }
        } catch (e) {
          console.error('Failed to parse window message:', e);
        }
      });
      
      if (!isTopWindow && window.parent) {
        window.addEventListener('message', function(event) {
          try {
            const d = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            if (d.type === 'BIOMETRIC_LOGIN_REQUEST' || d.type === 'PIN_LOGIN_REQUEST') fwd(d);
          } catch(_) {}
        });
      }
      
      // 네이티브 로그아웃 이벤트 처리
      window.addEventListener('nativeLogout', function(event) {
        const skipRefresh = event.detail?.skipRefresh || false;
        
        try {
          if (typeof window.handleLogout === 'function') {
            window.handleLogout();
          }
          
          window.dispatchEvent(new CustomEvent('webLogout', { detail: { source: 'native' } }));
          
          if (!skipRefresh) {
            console.log('[WebView] 로그아웃 후 새로고침');
            setTimeout(() => window.location.reload(), 100);
          } else {
            console.log('[WebView] 로그아웃 후 새로고침 건너뛰기');
          }
        } catch (error) {
          console.error('[WebView] 로그아웃 처리 실패:', error);
        }
      });
      
      if (!isTopWindow && window.parent) {
        window.requestBiometricLogin = function() { 
          window.parent.postMessage({ type:'BIOMETRIC_LOGIN_REQUEST', timestamp: Date.now() }, '*'); 
        };
        window.requestPinLogin = function() { 
          window.parent.postMessage({ type:'PIN_LOGIN_REQUEST', timestamp: Date.now() }, '*'); 
        };
      }
      
      if (isTopWindow) {
        window.requestBiometricLogin = function() { fwd({ type:'BIOMETRIC_LOGIN_REQUEST', timestamp: Date.now() }); };
        window.requestPinLogin = function() { fwd({ type:'PIN_LOGIN_REQUEST', timestamp: Date.now() }); };
        
        // 웹에서 일반 로그인 성공 시 RN으로 전달하는 함수
        window.sendLoginSuccessToRN = function(loginData) {
          console.log('📤 웹 로그인 성공을 RN으로 전송:', loginData);
          fwd({
            type: 'loginSuccess',
            success: true,
            accessToken: loginData.accessToken,
            refreshToken: loginData.refreshToken,
            expiresAt: loginData.expiresAt,
            user: loginData.user
          });
        };
      }
      
      true;
    })();
  `;

  return (
    <View style={[{ flex: 1 }, style]}>
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={{ flex: 1 }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={false}
        onMessage={handleMessage}
        injectedJavaScript={injectedJavaScript}
        onLoadEnd={handleLoadEnd}
        onError={(error) => console.error('WebView Error:', error)}
        onHttpError={(error) => console.error('WebView HTTP Error:', error)}
      />
    </View>
  );
}
