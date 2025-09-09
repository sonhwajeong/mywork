// 샘플 API 유틸: 실제 서버 엔드포인트에 맞게 교체하세요.
import { setSecureItem } from '@/utils/secure';
import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL as string) || 'http://172.16.2.84:8080';

export class AuthApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

async function postJson<T>(path: string, body: any): Promise<T> {
  try {
    // Debug: 요청 로그 (민감 정보 주의)
    // 개발 중에만 사용하세요
    console.log('[POST]', `${API_BASE}${path}`);
    console.log('[POST body]', typeof body === 'string' ? body : JSON.stringify(body));
  } catch { }
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let code: string | undefined;
    let detail = '';
    try {
      const j = await res.json();
      code = (j?.code as string) || (j?.error as string);
      detail = j?.message || '';
    } catch {
      try { detail = await res.text(); } catch { /* noop */ }
    }
    throw new AuthApiError(detail || `API ${path} failed`, res.status, code);
  }
  return res.json();
}

async function getJson<T>(pathWithQuery: string): Promise<T> {
  const res = await fetch(`${API_BASE}${pathWithQuery}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    let code: string | undefined;
    let detail = '';
    try {
      const j = await res.json();
      code = (j?.code as string) || (j?.error as string);
      detail = j?.message || '';
    } catch {
      try { detail = await res.text(); } catch { /* noop */ }
    }
    throw new AuthApiError(detail || `API ${pathWithQuery} failed`, res.status, code);
  }
  return res.json();
}

/**
 * PIN 검증 함수
 * @param pin PIN 번호
 * @returns 유효한 PIN인지 여부
 */
function validatePin(pin: string): { isValid: boolean; message?: string } {
  // PIN은 4-8자리 숫자여야 함
  if (!pin || pin.length < 4 || pin.length > 8) {
    return { isValid: false, message: 'PIN은 4-8자리여야 합니다.' };
  }

  // 숫자만 허용
  if (!/^\d+$/.test(pin)) {
    return { isValid: false, message: 'PIN은 숫자만 허용됩니다.' };
  }

  return { isValid: true };
}

/**
 * PIN을 해시로 변환하는 함수
 * @param pin PIN 번호 (4-8자리 숫자)
 * @returns SHA-256 해시값
 */
// 간단한 해시 함수 (대체용)
function simpleHash(str: string): string {
  let hash = 0;
  if (str.length === 0) return hash.toString();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32bit 정수로 변환
  }
  // 더 복잡한 해시로 만들기 위해 몇 번 더 변환
  let result = Math.abs(hash).toString(16);
  while (result.length < 8) {
    result = '0' + result;
  }
  return 'simple_' + result + '_' + str.length;
}

async function hashPin(pin: string): Promise<string> {
  try {
    if (!Crypto || typeof Crypto.digestStringAsync !== 'function' || !Crypto.CryptoDigestAlgorithm?.SHA256) {
      console.log('hashPin - fallback: Crypto 사용 불가. simpleHash 사용, 입력 길이:', pin?.length ?? 0);
      return simpleHash(pin);
    }
    const hashedPin = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
    console.log('hashPin - success: 입력 길이:', pin?.length ?? 0, 'SHA-256 해시 프리뷰:', hashedPin?.slice(0, 12) + '...');
    return hashedPin;
  } catch {
    console.log('hashPin - error: 에러 발생. simpleHash 사용, 입력 길이:', pin?.length ?? 0);
    return simpleHash(pin);
  }
}

export async function setPinOnServer(
  email: string, 
  pin: string, 
  deviceId: string, 
  platform: 'iOS' | 'Android'
): Promise<{ success: boolean; message: string }> {
  console.log('setPinOnServer 호출:', { email, pinLength: pin.length, deviceId, platform });

  // PIN 검증
  const validation = validatePin(pin);
  if (!validation.isValid) {
    throw new Error(validation.message);
  }

  // PIN을 해시로 변환 (일시적으로 비활성화 - 디버깅용)
  let hashedPin: string;
  try {
    hashedPin = await hashPin(pin);
    console.log('PIN 해시 완료');
  } catch (error) {
    console.error('PIN 해시 실패, 원본 PIN 사용:', error);
    hashedPin = pin; // 해시화 실패 시 원본 PIN 사용 (디버깅용)
  }

  console.log('API 호출 시작: /auth/set-pin');
  const payload = { email, pin: hashedPin, deviceId, platform };
  
  console.log('POST /auth/set-pin (Debug)', {
    url: `${API_BASE}/auth/set-pin`,
    payload,
    pinWasHashed: hashedPin !== pin
  });

  const response = await postJson<{ success: boolean; message: string; data?: string }>('/auth/set-pin', payload);
  console.log('API 호출 완료: /auth/set-pin');

  console.log('PIN 설정 API 응답', {
    response,
    processed: {
      success: response.success ?? true,
      message: response.message ?? 'PIN이 설정되었습니다.'
    }
  });

  return {
    success: response.success ?? true,
    message: response.message ?? 'PIN이 설정되었습니다.'
  };
}

export async function loginWithPinOnServer(
  deviceId: string,
  pin: string,
  platform?: 'iOS' | 'Android' | 'WebView'
) {
  // PIN 검증 (원본 PIN으로 클라이언트 validation)
  const validation = validatePin(pin);
  if (!validation.isValid) {
    throw new Error(validation.message);
  }

  // PIN을 해시화 후 서버에 전송
  let hashedPin: string;
  try {
    hashedPin = await hashPin(pin);
    console.log('PIN 해시 완료');
  } catch (error) {
    console.error('PIN 해시 실패, 원본 PIN 사용:', error);
    hashedPin = pin; // 해시화 실패 시 원본 PIN 사용 (디버깅용)
  }

  console.log('POST /auth/pin-login (Debug)', {
    url: `${API_BASE}/auth/pin-login`,
    payload: { deviceId, pin: hashedPin, platform },
    pinWasHashed: hashedPin !== pin
  });

  const response = await postJson<{ accessToken: string; refreshToken: string; expiresAt: number; user: { name: string; email: string } }>(
    '/auth/pin-login',
    { deviceId, pin: hashedPin, platform }
  );

  console.log('PIN 로그인 API 응답:', response);

  return response;
}

export async function fetchPinStatus(email: string): Promise<{ enabled: boolean }> {
  const q = `/auth/pin-status?email=${encodeURIComponent(email)}`;
  console.log('GET /auth/pin-status', { url: `${API_BASE}${q}` });
  const res = await getJson<{ enabled: boolean }>(q);
  console.log('PIN 상태 응답:', res);
  return res;
}


/**
 * 디바이스 ID 기반 로그인 옵션 조회 (토큰 없이)
 * 생체인증/PIN 로그인 전 등록 여부 확인용
 */
export async function fetchLoginOptionsWithDeviceId(deviceId: string): Promise<{
  hasPin: boolean;
  hasPasskey: boolean;
  deviceId: string;
}> {
  console.log('POST /auth/login-options-by-device', {
    url: `${API_BASE}/auth/login-options-by-device`,
    body: { deviceId }
  });

  const res = await fetch(`${API_BASE}/auth/login-options-by-device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  });

  if (!res.ok) {
    let code: string | undefined;
    let detail = '';
    try {
      const j = await res.json();
      code = (j?.code as string) || (j?.error as string);
      detail = j?.message || '';
    } catch {
      try { detail = await res.text(); } catch { /* noop */ }
    }
    throw new AuthApiError(detail || 'Login options by device API failed', res.status, code);
  }

  const response = await res.json();
  console.log('login-options-by-device 응답:', response);
  return response.data; // API 응답의 data 필드에서 실제 데이터 추출
}




// ---- Auth: ID/PW, Refresh, Logout, Revoke ----
export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms for access token expiry
  user?: { name: string; email: string };
  biometricEligible?: boolean;
};


export async function logoutOnServer(refreshToken: string, deviceId?: string): Promise<void> {
  await postJson('/auth/logout', { refreshToken, deviceId });
}

/**
 * 토큰 검증 API (/auth/check)
 * 액세스 토큰과 디바이스 ID로 토큰 유효성 검증
 */
export async function checkTokenValid(accessToken: string, deviceId: string): Promise<{
  success: boolean;
  message: string;
  data?: {
    valid: boolean;
    userEmail: string;
    tokenDeviceId: string;
    expiresAt: number;
  };
}> {
  console.log('=== checkTokenValid API 호출 ===');
  console.log('AccessToken:', accessToken ? `${accessToken.substring(0, 20)}...` : 'null');
  console.log('DeviceId:', deviceId);

  try {
    const result = await postJson('/auth/check', {
      accessToken,
      deviceId
    });
    
    console.log('토큰 검증 결과:', result);
    return result;
  } catch (error) {
    console.error('토큰 검증 실패:', error);
    return {
      success: false,
      message: '토큰 검증 중 오류가 발생했습니다.'
    };
  }
}

/**
 * 리프레시 토큰으로 새 액세스 토큰 발급 (/auth/refresh)
 * 리프레시 토큰과 디바이스 ID로 새로운 액세스 토큰 요청
 */
export async function refreshAccessToken(refreshToken: string, deviceId: string): Promise<{
  success: boolean;
  message: string;
  data?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    user: {
      id: string;
      name: string;
      role: string;
    };
  };
}> {
  console.log('=== refreshAccessToken API 호출 ===');
  console.log('RefreshToken:', refreshToken ? `${refreshToken.substring(0, 20)}...` : 'null');
  console.log('DeviceId:', deviceId);

  try {
    const result = await postJson('/auth/refresh', {
      refreshToken,
      deviceId
    });
    
    console.log('토큰 리프레시 결과:', result);
    return result;
  } catch (error) {
    console.error('토큰 리프레시 실패:', error);
    return {
      success: false,
      message: '토큰 리프레시 중 오류가 발생했습니다.'
    };
  }
}




// ---- Biometric Login ----
export async function biometricLoginOnServer(payload: {
  deviceId: string;
  platform: 'iOS' | 'Android';
}): Promise<{ accessToken: string; refreshToken: string; expiresAt: number; user: { name: string; email: string } }> {
  return postJson('/auth/biometric-login', payload);
}

/**
 * 생체인식 등록/설정 API
 * 로그인된 상태에서만 호출 가능 (Authorization 헤더 필요)
 */
export async function setupBiometricOnServer(payload: {
  email: string;
  deviceId: string;
  deviceName?: string;
  platform: 'iOS' | 'Android';
  method: 'FACE_ID' | 'TOUCH_ID' | 'FINGERPRINT';
}, accessToken: string): Promise<{ success: boolean; message: string }> {

  console.log('=== setupBiometricOnServer API 호출 ===');
  console.log('API_BASE:', API_BASE);
  console.log('URL:', `${API_BASE}/auth/setup-biometric`);
  console.log('Payload:', JSON.stringify(payload, null, 2));
  console.log('AccessToken exists:', !!accessToken);

  console.log('POST /auth/setup-biometric', {
    url: `${API_BASE}/auth/setup-biometric`,
    headers: { Authorization: accessToken ? `Bearer ${accessToken.substring(0, 20)}...` : 'none' },
    payload
  });

  try {
    const res = await fetch(`${API_BASE}/auth/setup-biometric`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload),
    });

    console.log('Response status:', res.status);
    console.log('Response headers:', Object.fromEntries(res.headers.entries()));

    if (!res.ok) {
      let code: string | undefined;
      let detail = '';
      console.log('Response not OK, reading error...');

      try {
        const responseText = await res.text();
        console.log('Raw error response:', responseText);

        try {
          const j = JSON.parse(responseText);
          code = (j?.code as string) || (j?.error as string);
          detail = j?.message || responseText;
        } catch (jsonError) {
          console.log('Failed to parse error response as JSON:', jsonError);
          detail = responseText;
        }
      } catch (textError) {
        console.log('Failed to read error response text:', textError);
        detail = 'Unknown error';
      }

      throw new AuthApiError(detail || 'Biometric setup API failed', res.status, code);
    }

    try {
      const responseText = await res.text();
      console.log('Success response text:', responseText);

      let response;
      if (responseText.trim()) {
        try {
          response = JSON.parse(responseText);
          console.log('Parsed response:', response);
        } catch (parseError) {
          console.log('Failed to parse success response as JSON:', parseError);
          response = { success: true, message: '생체인식 설정이 완료되었습니다.' };
        }
      } else {
        console.log('Empty response body, assuming success');
        response = { success: true, message: '생체인식 설정이 완료되었습니다.' };
      }

      console.log('생체인식 설정 API 응답', {
        rawResponse: responseText,
        parsed: response,
        processed: {
          success: response?.success ?? true,
          message: response?.message ?? '생체인식 설정이 완료되었습니다.'
        }
      });

      return {
        success: response?.success ?? true,
        message: response?.message ?? '생체인식 설정이 완료되었습니다.'
      };
    } catch (parseError) {
      console.error('Failed to parse biometric setup response:', parseError);
      // JSON 파싱 실패 시 성공으로 간주 (200 OK 응답이므로)
      return {
        success: true,
        message: '생체인식 설정이 완료되었습니다.'
      };
    }
  } catch (networkError) {
    console.error('Network error in setupBiometricOnServer:', networkError);
    throw networkError;
  }
}

/**
 * FCM 토큰을 서버에 전송
 * @param fcmToken FCM 토큰
 * @param accessToken 인증 토큰 (옵션)
 * @returns 성공/실패 정보
 */
export async function sendFCMTokenToServer(fcmToken: string, accessToken?: string): Promise<{ success: boolean; message?: string }> {
  try {

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // 액세스 토큰이 있으면 Authorization 헤더 추가
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${API_BASE}/auth/fcm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        deviceToken: fcmToken
      })
    });

    const responseText = await response.text();

    if (!response.ok) {
      let errorMessage = 'FCM 토큰 전송에 실패했습니다.';
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        errorMessage = responseText || errorMessage;
      }
      
      
      return {
        success: false,
        message: errorMessage
      };
    }

    // 성공 응답 처리
    let successResponse;
    if (responseText.trim()) {
      try {
        successResponse = JSON.parse(responseText);
      } catch {
        successResponse = { success: true, message: 'FCM 토큰이 성공적으로 전송되었습니다.' };
      }
    } else {
      successResponse = { success: true, message: 'FCM 토큰이 성공적으로 전송되었습니다.' };
    }

    
    return {
      success: true,
      message: successResponse.message || 'FCM 토큰이 성공적으로 전송되었습니다.'
    };

  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'FCM 토큰 전송 중 오류가 발생했습니다.'
    };
  }
}

