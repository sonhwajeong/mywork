import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { SECURE_KEYS, getSecureItem, setSecureItem, deleteSecureItem, getPinEnabled, setLastEmail, getLastEmail, getDeviceInfo } from '@/utils/secure';
import { loginWithPinOnServer, biometricLoginOnServer, fetchLoginOptionsWithDeviceId, logoutOnServer } from '@/utils/api';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { webViewManager } from '@/utils/webview-manager';

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

  /**
   * 앱 시작 시 저장된 인증 정보 로드
   */
  useEffect(() => {
    (async () => {
      try {
        const [storedToken, localPinFlag] = await Promise.all([
          getSecureItem(SECURE_KEYS.refreshToken),  // 저장된 리프레시 토큰 확인
          getPinEnabled(),                          // PIN 설정 상태 확인
        ]);
        
        setHasStoredSession(!!storedToken);  // 세션 존재 여부 설정
        setPinEnabledState(!!localPinFlag);  // PIN 활성화 상태 설정
      } catch (error) {
        console.error('Failed to load stored auth info:', error);
      } finally {
        setReady(true);  // 초기화 완료
      }
    })();
  }, []);


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

      // 6. 성공 시 새로운 토큰 정보와 함께 반환
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
      } catch (error) {
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
    [user, token, accessToken, ready, hasStoredSession, pinEnabled, lastWebLoginMessage]
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