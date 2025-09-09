import React, { createContext, useContext, useEffect, useMemo, useState, useRef } from 'react';
import { SECURE_KEYS, getSecureItem, setSecureItem, deleteSecureItem, getPinEnabled, setLastEmail, getLastEmail, getDeviceInfo } from '@/utils/secure';
import { loginWithPinOnServer, biometricLoginOnServer, fetchLoginOptionsWithDeviceId, logoutOnServer, checkTokenValid, refreshAccessToken } from '@/utils/api';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { webViewManager } from '@/utils/webview-manager';
import { FCMService } from '@/utils/fcm';

/**
 * 사용자 정보 타입
 */
type User = { name: string; email: string } | null;

/**
 * WebView에서 받는 메시지 타입
 */
export type WebLoginMessage =
  | { type: 'loginSuccess'; success: true; accessToken: string; refreshToken: string; expiresAt: number; user?: { email?: string; name?: string } }
  | { type: 'loginFailure'; success: false; error: string }
  | { type: 'securitySetupNeeded'; data: { hasPin: boolean; hasPasskey: boolean; email: string } }
  | { type: 'PIN_LOGIN_REQUEST'; timestamp: number };

/**
 * 초기화 상태 타입
 */
type InitState = {
  step: 'starting' | 'device' | 'tokens' | 'validation' | 'complete' | 'timeout' | 'error';
  error: string | null;
  ready: boolean;
};

/**
 * 인증 컨텍스트 타입 정의
 */
type AuthContextType = {
  // 상태
  user: User;                    // 현재 사용자 정보
  token: string | null;          // 현재 토큰 (로컬 상태용)
  accessToken: string | null;    // 현재 액세스 토큰 (API 호출용)
  ready: boolean;               // 초기화 완료 여부
  hasStoredSession: boolean;    // 저장된 세션 존재 여부
  pinEnabled: boolean;          // PIN 인증 활성화 여부
  initState: InitState;         // 초기화 상태 정보
  
  // 인증 메소드
  pinLogin: (pin: string, deviceId?: string, platform?: 'iOS' | 'Android' | 'WebView') => Promise<{ success: boolean; user?: User; error?: string; accessToken?: string; refreshToken?: string; expiresAt?: number }>;                                 // PIN 로그인
  biometricLogin: () => Promise<{ success: boolean; user?: User; error?: string; accessToken?: string; refreshToken?: string; expiresAt?: number }>;             // 생체인증 로그인
  completeLogin: (payload: { refreshToken: string; user: { name: string; email: string }; accessToken?: string }) => Promise<void>; // 로그인 완료 처리
  logout: (skipWebViewRefresh?: boolean) => Promise<void>;                                 // 로그아웃
  
  // 로그인 옵션 조회
  fetchLoginOptions: () => Promise<{ hasPin: boolean; hasPasskey: boolean; email: string } | null>; // 로그인 옵션 조회
  
  // WebView 로그인 메시지 처리
  lastWebLoginMessage: WebLoginMessage | null;
  setLastWebLoginMessage: (message: WebLoginMessage | null) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);


/**
 * 인증 상태 관리를 위한 Provider 컴포넌트
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  // 상태 관리
  const [ready, setReady] = useState(false);                    // 초기화 완료 상태
  const [user, setUser] = useState<User>(null);                 // 현재 사용자 정보
  const [token, setToken] = useState<string | null>(null);      // 현재 토큰 (로컬 상태)
  const [accessToken, setAccessToken] = useState<string | null>(null); // 현재 액세스 토큰 (API 호출용)
  const [hasStoredSession, setHasStoredSession] = useState(false); // 저장된 세션 존재 여부
  const [pinEnabled, setPinEnabledState] = useState(false);     // PIN 인증 활성화 여부
  const [lastWebLoginMessage, setLastWebLoginMessage] = useState<WebLoginMessage | null>(null); // WebView 로그인 메시지
  const [initState, setInitState] = useState<InitState>({      // 초기화 상태
    step: 'starting',
    error: null,
    ready: false
  });

  // AppState 추적을 위한 ref
  const appState = useRef(AppState.currentState);
  const isInitializedRef = useRef(false);

  /**
   * 웹에서 토큰 검증 응답을 처리하는 콜백
   */
  const handleTokenVerificationResponse = async (message: {
    type: 'RN_SET_TOKENS_SUCCESS' | 'RN_SET_TOKENS_FAILED' | 'RN_SET_TOKENS_ERROR';
    success: boolean;
    deviceId: string;
    user?: { id: string; email: string; loginMethod: string };
    error?: string;
    timestamp: number;
  }) => {
    console.log('토큰 검증 응답 수신:', message);

    if (message.type === 'RN_SET_TOKENS_FAILED' || message.type === 'RN_SET_TOKENS_ERROR') {
      // 검증 실패 시 앱의 토큰 제거
      console.log('웹에서 토큰 검증 실패 - 앱 토큰 제거');
      
      try {
        await Promise.all([
          deleteSecureItem(SECURE_KEYS.refreshToken).catch(() => {}),
          deleteSecureItem(SECURE_KEYS.accessToken).catch(() => {})
        ]);
        
        setHasStoredSession(false);
        setAccessToken(null);
        setToken(null);
        setUser(null);
        
        console.log('앱 토큰 제거 완료');
      } catch (error) {
        console.warn('앱 토큰 제거 중 오류:', error);
      }
    } else if (message.type === 'RN_SET_TOKENS_SUCCESS') {
      console.log('웹에서 토큰 검증 성공 확인');
    }
  };

  /**
   * 토큰 검증/동기화 재초기화 함수 (AppState 변경 시 호출)
   */
  const reInitializeTokenSync = async () => {
    console.log('🔄 AppState 변경으로 토큰 동기화 재초기화');
    
    try {
      // 디바이스 정보 가져오기
      console.log('📱 AppState 재초기화 - 디바이스 정보 조회 중...');
      const deviceInfo = await getDeviceInfo();
      console.log('📱 AppState 재초기화 - 디바이스 정보 조회 완료:', deviceInfo.deviceId);
      
      // 저장된 토큰들 확인
      console.log('🔍 AppState 재초기화 - 토큰 조회 시작...');
      
      console.log('1️⃣ AppState 재초기화 - RefreshToken 조회 중...');
      const storedRefreshToken = await getSecureItem(SECURE_KEYS.refreshToken).catch((err) => {
        console.log('❌ AppState 재초기화 - RefreshToken 조회 실패:', err);
        return null;
      });
      console.log('1️⃣ AppState 재초기화 - RefreshToken 결과:', storedRefreshToken ? `있음 (길이: ${storedRefreshToken.length})` : '없음');

      console.log('2️⃣ AppState 재초기화 - AccessToken 조회 중...');
      const storedAccessToken = await getSecureItem(SECURE_KEYS.accessToken).catch((err) => {
        console.log('❌ AppState 재초기화 - AccessToken 조회 실패:', err);
        return null;
      });
      console.log('2️⃣ AppState 재초기화 - AccessToken 결과:', storedAccessToken ? `있음 (길이: ${storedAccessToken.length})` : '없음');

      console.log('🔍 AppState 변경 시 최종 토큰 상태:', {
        hasRefreshToken: !!storedRefreshToken,
        hasAccessToken: !!storedAccessToken,
        refreshTokenLength: storedRefreshToken?.length || 0,
        accessTokenLength: storedAccessToken?.length || 0
      });

      // 액세스 토큰이 있으면 검증하고 웹에 동기화
      if (storedAccessToken && storedRefreshToken) {
        console.log('🔐 AppState 변경 시 액세스 토큰 검증 및 웹 동기화');
      } else {
        console.log('⚠️ AppState 변경 시 토큰 부족으로 동기화 건너뜀:', {
          hasAccessToken: !!storedAccessToken,
          hasRefreshToken: !!storedRefreshToken
        });
        return; // 토큰이 없으면 여기서 종료
      }

      if (storedAccessToken && storedRefreshToken) {
        
        try {
          const checkResult = await checkTokenValid(storedAccessToken, deviceInfo.deviceId);
          
          if (checkResult.success && checkResult.data.valid) {
            // 토큰이 유효한 경우 웹에 동기화
            console.log('✅ AppState 변경 시 토큰 유효 - 웹에 동기화');
            
            webViewManager.broadcastSetTokens(
              storedAccessToken,
              deviceInfo.deviceId,
              {
                name: checkResult.data.userEmail,
                email: checkResult.data.userEmail
              }
            );
          } else {
            // 액세스 토큰이 만료된 경우 리프레시 시도
            console.log('⚠️ AppState 변경 시 액세스 토큰 만료 - 리프레시 시도');
            
            const refreshResult = await refreshAccessToken(storedRefreshToken, deviceInfo.deviceId);
            
            if (refreshResult.success) {
              console.log('✅ AppState 변경 시 토큰 리프레시 성공 - 웹에 동기화');
              
              const newAccessToken = refreshResult.accessToken;
              const userData = refreshResult.user;
              
              // 새로운 액세스 토큰 저장
              await setSecureItem(SECURE_KEYS.accessToken, newAccessToken);
              
              // 상태 업데이트
              setAccessToken(newAccessToken);
              setUser({
                name: userData.name,
                email: userData.email
              });
              
              // 웹에 새 토큰 동기화
              webViewManager.broadcastSetTokens(
                newAccessToken,
                deviceInfo.deviceId,
                {
                  name: userData.name,
                  email: userData.email
                }
              );
            }
          }
        } catch (error) {
          console.warn('AppState 변경 시 토큰 검증/리프레시 실패:', error);
        }
      }
    } catch (error) {
      console.warn('AppState 변경 시 토큰 동기화 실패:', error);
    }
  };

  /**
   * 앱 시작 시 저장된 인증 정보 로드 및 토큰 검증 (타임아웃 및 단계별 상태 관리)
   */
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isCompleted = false;

    // 토큰 검증 응답 콜백 등록
    webViewManager.registerTokenVerificationCallback(handleTokenVerificationResponse);

    // 컴포넌트 언마운트 시 콜백 해제
    const cleanup = () => {
      webViewManager.unregisterTokenVerificationCallback(handleTokenVerificationResponse);
    };

    const updateInitState = (step: InitState['step'], error: string | null = null) => {
      const ready = step === 'complete' || step === 'timeout' || step === 'error';
      setInitState({ step, error, ready });
      if (ready && !isCompleted) {
        isCompleted = true;
        setReady(true);
        isInitializedRef.current = true; // 초기화 완료 표시
      }
    };

    const initializeAuth = async () => {
      try {
        console.log('🚀 앱 시작 - 인증 정보 로드 및 토큰 검증 시작');
        updateInitState('starting');

        // 1. 디바이스 ID 먼저 생성/로드
        updateInitState('device');
        let deviceInfo;
        try {
          deviceInfo = await getDeviceInfo();
          console.log('📱 디바이스 ID 로드 완료:', deviceInfo.deviceId);
        } catch (error) {
          console.warn('⚠️ 디바이스 정보 로드 실패, 기본값 사용:', error);
          deviceInfo = { deviceId: 'unknown-device', platform: 'unknown' as any };
        }

        // 2. 저장된 토큰 및 PIN 설정 상태 확인
        updateInitState('tokens');
        let storedRefreshToken, storedAccessToken, localPinFlag;
        
        console.log('🔍 토큰 조회 시작 - SECURE_KEYS:', {
          refreshTokenKey: SECURE_KEYS.refreshToken,
          accessTokenKey: SECURE_KEYS.accessToken
        });
        
        try {
          console.log('📥 개별 토큰 조회 시작...');
          
          // 개별적으로 토큰 조회하면서 상세 로그 출력
          console.log('1️⃣ RefreshToken 조회 중...');
          storedRefreshToken = await getSecureItem(SECURE_KEYS.refreshToken).catch((err) => {
            console.log('❌ RefreshToken 조회 실패:', err);
            return null;
          });
          console.log('1️⃣ RefreshToken 결과:', storedRefreshToken ? `있음 (길이: ${storedRefreshToken.length})` : '없음');

          console.log('2️⃣ AccessToken 조회 중...');
          storedAccessToken = await getSecureItem(SECURE_KEYS.accessToken).catch((err) => {
            console.log('❌ AccessToken 조회 실패:', err);
            return null;
          });
          console.log('2️⃣ AccessToken 결과:', storedAccessToken ? `있음 (길이: ${storedAccessToken.length})` : '없음');

          console.log('3️⃣ PIN 설정 상태 조회 중...');
          localPinFlag = await getPinEnabled().catch((err) => {
            console.log('❌ PIN 설정 조회 실패:', err);
            return false;
          });
          console.log('3️⃣ PIN 설정 결과:', localPinFlag);

          console.log('🔍 최종 저장된 토큰 확인:', {
            hasRefreshToken: !!storedRefreshToken,
            hasAccessToken: !!storedAccessToken,
            pinEnabled: !!localPinFlag,
            refreshTokenLength: storedRefreshToken?.length || 0,
            accessTokenLength: storedAccessToken?.length || 0
          });
        } catch (error) {
          console.warn('⚠️ 토큰 확인 실패, 기본값 사용:', error);
          storedRefreshToken = null;
          storedAccessToken = null;
          localPinFlag = false;
        }

        setHasStoredSession(!!storedRefreshToken);  // 세션 존재 여부 설정
        setPinEnabledState(!!localPinFlag);         // PIN 활성화 상태 설정

        // 3. 액세스 토큰이 있으면 검증 시도
        updateInitState('validation');
        if (storedAccessToken && storedRefreshToken) {
          console.log('🔐 액세스 토큰 검증 시작');
        } else {
          console.log('⚠️ 초기화 시 토큰 부족으로 검증 건너뜀:', {
            hasAccessToken: !!storedAccessToken,
            hasRefreshToken: !!storedRefreshToken
          });
        }

        if (storedAccessToken && storedRefreshToken) {
          
          try {
            const checkResult = await checkTokenValid(storedAccessToken, deviceInfo.deviceId);
            
            if (checkResult.success && checkResult.data.valid) {
              // 토큰이 유효한 경우
              console.log('✅ 액세스 토큰 유효 - 사용자 상태 설정');
              
              setAccessToken(storedAccessToken);
              setToken(storedRefreshToken);
              setUser({
                name: checkResult.data.userEmail,
                email: checkResult.data.userEmail
              });
              
              // 웹에 토큰 정보 전달
              try {
                webViewManager.broadcastSetTokens(
                  storedAccessToken, 
                  deviceInfo.deviceId, 
                  {
                    name: checkResult.data.userEmail,
                    email: checkResult.data.userEmail
                  }
                );
                console.log('📤 웹에 RN_SET_TOKENS 메시지 전송 완료');
              } catch (error) {
                console.warn('웹 메시지 전송 실패 (무시됨):', error);
              }
              
            } else {
              // 액세스 토큰이 만료되었거나 유효하지 않은 경우 - 리프레시 토큰으로 갱신 시도
              console.log('⚠️ 액세스 토큰 무효 - 리프레시 토큰으로 갱신 시도');
              
              try {
                const refreshResult = await refreshAccessToken(storedRefreshToken, deviceInfo.deviceId);

                if (refreshResult.success ) {
                  // 리프레시 성공
                  console.log('✅ 토큰 리프레시 성공 - 새 액세스 토큰 저장');
                  
                  const newAccessToken = refreshResult.accessToken;
                  const userData = refreshResult.user;
                  
                  // 새로운 액세스 토큰 저장
                  await setSecureItem(SECURE_KEYS.accessToken, newAccessToken);
                  
                  setAccessToken(newAccessToken);
                  setToken(storedRefreshToken);
                  setUser({
                    name: userData.name,
                    email: userData.id
                  });
                  
                  // 웹에 새 토큰 정보 전달
                  try {
                    webViewManager.broadcastSetTokens(
                      newAccessToken,
                      deviceInfo.deviceId,
                      {
                        name: userData.name,
                        email: userData.id
                      }
                    );
                    console.log('📤 웹에 새 RN_SET_TOKENS 메시지 전송 완료');
                  } catch (error) {
                    console.warn('웹 메시지 전송 실패 (무시됨):', error);
                  }
                  
                } else {
                  // 리프레시도 실패 - 로그아웃 처리
                  console.log('❌ 토큰 리프레시 실패 - 저장된 세션 정리');
                  
                  await Promise.all([
                    deleteSecureItem(SECURE_KEYS.refreshToken).catch(() => {}),
                    deleteSecureItem(SECURE_KEYS.accessToken).catch(() => {})
                  ]);
                  
                  setHasStoredSession(false);
                  setAccessToken(null);
                  setToken(null);
                  setUser(null);
                }
              } catch (refreshError) {
                console.warn('토큰 리프레시 중 오류:', refreshError);
                // 세션 정리
                await Promise.all([
                  deleteSecureItem(SECURE_KEYS.refreshToken).catch(() => {}),
                  deleteSecureItem(SECURE_KEYS.accessToken).catch(() => {})
                ]);
                setHasStoredSession(false);
                setAccessToken(null);
                setToken(null);
                setUser(null);
              }
            }
          } catch (checkError) {
            console.warn('토큰 검증 중 오류:', checkError);
            // 검증 실패 시 리프레시 시도는 하지 않고 세션만 유지
          }
        } else if (storedRefreshToken) {
          // 액세스 토큰은 없고 리프레시 토큰만 있는 경우
          console.log('🔄 액세스 토큰 없음 - 리프레시 토큰으로 생성 시도');
          
          try {
            const refreshResult = await refreshAccessToken(storedRefreshToken, deviceInfo.deviceId);
            
            if (refreshResult.success) {
              console.log('✅ 리프레시 토큰으로 액세스 토큰 생성 성공');
              
              const newAccessToken = refreshResult.accessToken;
              const userData = refreshResult.user;
              
              // 새로운 액세스 토큰 저장
              await setSecureItem(SECURE_KEYS.accessToken, newAccessToken);
              
              setAccessToken(newAccessToken);
              setToken(storedRefreshToken);
              setUser({
                name: userData.name,
                email: userData.email
              });
              
              // 웹에 토큰 정보 전달
              try {
                webViewManager.broadcastSetTokens(
                  newAccessToken,
                  deviceInfo.deviceId,
                  {
                    name: userData.name,
                    email: userData.id
                  }
                );
                console.log('📤 웹에 RN_SET_TOKENS 메시지 전송 완료');
              } catch (error) {
                console.warn('웹 메시지 전송 실패 (무시됨):', error);
              }
            }
          } catch (error) {
            console.warn('리프레시 토큰으로 액세스 토큰 생성 실패:', error);
          }
        }

        // FCM 초기화 (로그인 여부와 무관하게)
        try {
          await FCMService.initialize();
          console.log('📱 FCM 초기화 완료');
        } catch (error) {
          console.warn('FCM 초기화 실패 (무시됨):', error);
        }

        updateInitState('complete');
        console.log('🏁 앱 초기화 완료');

      } catch (error) {
        console.error('❌ 앱 시작 시 인증 정보 로드/검증 실패:', error);
        
        // 오류 발생 시 세션 정리
        try {
          await Promise.all([
            deleteSecureItem(SECURE_KEYS.refreshToken).catch(() => {}),
            deleteSecureItem(SECURE_KEYS.accessToken).catch(() => {})
          ]);
          
          setHasStoredSession(false);
          setAccessToken(null);
          setToken(null);
          setUser(null);
        } catch (cleanupError) {
          console.warn('세션 정리 중 오류:', cleanupError);
        }
        
        updateInitState('error', error instanceof Error ? error.message : '초기화 중 오류가 발생했습니다.');
      }
    };

    // 15초 후 강제로 타임아웃
    timeoutId = setTimeout(() => {
      if (!isCompleted) {
        console.warn('⏰ 인증 초기화 타임아웃 - 기본값으로 설정');
        updateInitState('timeout', '초기화 시간이 초과되었습니다.');
      }
    }, 15000);

    initializeAuth();

    return () => {
      clearTimeout(timeoutId);
      cleanup();
    };
  }, []);

  /**
   * AppState 변경 감지 및 토큰 동기화 재초기화
   */
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      console.log('📱 AppState 변경:', appState.current, '->', nextAppState);
      
      // 백그라운드에서 active로 전환될 때만 재초기화 실행
      if (
        appState.current.match(/inactive|background/) && 
        nextAppState === 'active' && 
        isInitializedRef.current && 
        ready
      ) {
        console.log('🔄 앱이 백그라운드에서 active로 전환 - 토큰 동기화 재초기화');
        reInitializeTokenSync();
      }
      
      appState.current = nextAppState;
    };

    // AppState 리스너 등록
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      // AppState 리스너 해제
      subscription?.remove();
    };
  }, [ready]); // ready 상태가 변경될 때만 effect 재실행


  /**
   * PIN을 사용한 독립적인 로그인
   * login-option 체크 후 PIN 등록되어 있으면 /auth/pin-login API로 새로운 토큰 발급
   */
  const pinLogin = async (pin: string, deviceId?: string, platform?: 'iOS' | 'Android' | 'WebView') => {
    try {

      // 3. PIN 로그인 API 호출로 새로운 토큰 발급 (/auth/pin-login)
      const result = await loginWithPinOnServer(deviceId || 'unknown-device', pin, platform);
      
      // 4. 새로운 토큰으로 완전한 로그인 처리
      await setSecureItem(SECURE_KEYS.refreshToken, result.refreshToken);
      setToken(result.refreshToken);
      setAccessToken(result.accessToken);
      setUser(result.user);
      setHasStoredSession(true);

      // 5. 로그인된 이메일 저장
      if (result.user?.email) {
        await setLastEmail(result.user.email);
      }

      // 6. FCM 토큰 서버 전송 (백그라운드에서)
      FCMService.initialize(result.accessToken).catch(error => {
        console.warn('FCM 초기화 실패 (무시됨):', error);
      });

      // 7. 성공 시 새로운 토큰 정보와 함께 반환
      console.log('PIN 로그인 성공 - 토큰 저장 완료:', {
        user: result.user?.email,
        hasAccessToken: !!result.accessToken,
        hasRefreshToken: !!result.refreshToken
      });
      
      return {
        success: true,
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt
      };
    } catch (error) {
      console.error('PIN login failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'PIN 로그인에 실패했습니다.' 
      };
    }
  };

  /**
   * 생체인증을 사용한 독립적인 로그인
   * 디바이스 ID 기반으로 생체인증 성공 시 새로운 토큰 발급
   */
  const biometricLogin = async (): Promise<{ success: boolean; user?: User; error?: string; accessToken?: string; refreshToken?: string; expiresAt?: number }> => {
    try {
      // 1. 디바이스 정보 확인
      // getDeviceInfo 사용
      const deviceInfo = await getDeviceInfo();

      // 2. 서버에서 로그인 옵션 확인 (디바이스 ID 기반)
      // fetchLoginOptionsWithDeviceId 사용
      let loginOptions;
      try {
        loginOptions = await fetchLoginOptionsWithDeviceId(deviceInfo.deviceId);
      } catch {
        return { 
          success: false, 
          error: '디바이스 정보를 확인할 수 없습니다.\n먼저 일반 로그인 후 생체인증을 설정해주세요.' 
        };
      }
      
      if (!loginOptions?.hasPasskey) {
        return { 
          success: false, 
          error: '생체인증이 등록되지 않았습니다.\n마이페이지에서 생체인증을 먼저 설정해주세요.' 
        };
      }

      // 3. React Native 환경 확인
      if (!Platform.OS) {
        return { 
          success: false, 
          error: '생체인증을 사용할 수 없는 환경입니다.' 
        };
      }

      // 4. 생체인증 UI 표시
      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: '생체인증으로 로그인하세요',
        fallbackLabel: '취소',
        disableDeviceFallback: false,
      });
      
      if (!authResult.success) {
        return { 
          success: false, 
          error: '생체인증이 취소되었거나 실패했습니다.' 
        };
      }

      // 5. 생체인증 성공 → 디바이스 ID로 서버에서 새로운 토큰 발급
      const biometricResult = await biometricLoginOnServer({
        deviceId: deviceInfo.deviceId,
        platform: deviceInfo.platform,
      });

      // 6. 새로운 토큰으로 완전한 로그인 처리
      if (typeof biometricResult.refreshToken !== 'string') {
        throw new Error('refreshToken이 문자열이 아닙니다: ' + typeof biometricResult.refreshToken);
      }
      
      // 새로운 토큰들을 저장
      await setSecureItem(SECURE_KEYS.refreshToken, biometricResult.refreshToken);
      setToken(biometricResult.refreshToken);
      setAccessToken(biometricResult.accessToken);
      setUser(biometricResult.user);
      setHasStoredSession(true);

      // 7. 로그인된 이메일 저장
      if (biometricResult.user?.email) {
        await setLastEmail(biometricResult.user.email);
      }

      // 8. FCM 토큰 서버 전송 (백그라운드에서)
      FCMService.initialize(biometricResult.accessToken).catch(error => {
        console.warn('FCM 초기화 실패 (무시됨):', error);
      });
      
      return { 
        success: true, 
        user: biometricResult.user,
        accessToken: biometricResult.accessToken,
        refreshToken: biometricResult.refreshToken,
        expiresAt: biometricResult.expiresAt
      };
      
    } catch (error) {
      console.error('Biometric login failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '생체인증 로그인에 실패했습니다.' 
      };
    }
  };

  /**
   * 로그인 완료 처리 (WebView, Passkey 등에서 사용)
   * 토큰과 사용자 정보를 받아서 인증 상태를 설정
   */
  const completeLogin = async (payload: { refreshToken: string; user: { name: string; email: string }; accessToken?: string }) => {
    await setSecureItem(SECURE_KEYS.refreshToken, payload.refreshToken);
    setToken(payload.refreshToken);
    setUser(payload.user);
    
    // accessToken이 있으면 설정
    if (payload.accessToken) {
      setAccessToken(payload.accessToken);
    }
    
    // 마지막 로그인 이메일 저장 (PIN 로그인 등에서 사용)
    if (payload.user && payload.user.email) {
      await setLastEmail(payload.user.email);
    }
    
    // FCM 토큰 서버 전송 (백그라운드에서)
    if (payload.accessToken) {
      FCMService.initialize(payload.accessToken).catch(error => {
        console.warn('FCM 초기화 실패 (무시됨):', error);
      });
    }
    
    setHasStoredSession(true);
  };

  /**
   * 로그아웃 처리
   * 서버에 로그아웃 요청 후 로컬 데이터 정리 및 웹뷰에 로그아웃 신호 전송
   */
  const logout = async (skipWebViewRefresh?: boolean) => {
    try {
      const stored = await getSecureItem(SECURE_KEYS.refreshToken);
      if (stored) {
        try {
          // 서버에 로그아웃 요청 (세션 무효화)
          // logoutOnServer 사용
          await logoutOnServer(stored);
        } catch (error) {
          // 서버 오류 발생 시에도 로컬 정리는 진행
          console.warn('Server logout failed, proceeding with local cleanup:', error);
        }
      }
    } finally {
      // 웹뷰에 로그아웃 신호 전송 (skipWebViewRefresh 파라미터 전달)
      console.log(`Sending logout signal to WebViews (skipRefresh: ${skipWebViewRefresh})...`);
      webViewManager.broadcastLogout(skipWebViewRefresh || false);
      
      // 로컬 저장된 인증 정보 정리
      await deleteSecureItem(SECURE_KEYS.refreshToken);
      await deleteSecureItem(SECURE_KEYS.pinEnabled);
      setUser(null);
      setToken(null);
      setAccessToken(null);
      setHasStoredSession(false);
      setPinEnabledState(false);
      
      console.log('Logout completed. Native app and WebViews should be logged out.');
    }
  };


  /**
   * 로그인 옵션 조회 (PIN, 생체인식 설정 여부)
   * 디바이스 ID 기반으로 조회
   */
  const fetchLoginOptions = async (): Promise<{ hasPin: boolean; hasPasskey: boolean; email: string } | null> => {
    try {
      // 디바이스 정보 확인
      // getDeviceInfo 사용
      const deviceInfo = await getDeviceInfo();

      // fetchLoginOptionsWithDeviceId 사용
      const result = await fetchLoginOptionsWithDeviceId(deviceInfo.deviceId);
      
      // fetchLoginOptionsWithDeviceId는 email 필드가 없으므로, 마지막 로그인 이메일을 추가
      // getLastEmail 사용
      const lastEmail = await getLastEmail();
      
      return {
        hasPin: result.hasPin,
        hasPasskey: result.hasPasskey,
        email: lastEmail || 'user@example.com'
      };
    } catch (error) {
      console.error('Failed to fetch login options:', error);
      return null;
    }
  };

  /**
   * Context에 제공할 값들을 메모화
   * 의존성 배열의 값이 변경될 때만 새로운 객체 생성
   */
  const value = useMemo(
    () => ({
      // 상태
      user, 
      token,
      accessToken, 
      ready, 
      hasStoredSession, 
      pinEnabled,
      initState,
      
      // 메소드
      pinLogin, 
      biometricLogin,
      completeLogin, 
      logout, 
      fetchLoginOptions,
      
      // WebView 메시지 처리
      lastWebLoginMessage, 
      setLastWebLoginMessage,
    }),
    [user, token, accessToken, ready, hasStoredSession, pinEnabled, initState, lastWebLoginMessage]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * 인증 상태와 메소드에 접근하기 위한 훅
 * AuthProvider 내부에서만 사용 가능
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}