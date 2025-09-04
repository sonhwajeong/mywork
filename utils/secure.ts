import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';

export const SECURE_KEYS = {
  refreshToken: 'refreshToken',
  pinEnabled: 'pinEnabled',
  lastEmail: 'lastEmail',
  deviceId: 'deviceId',
} as const;

export async function setSecureItem(key: string, value: string) {
  const options = { keychainService: 'app.secure' } as SecureStore.SecureStoreOptions;
  await SecureStore.setItemAsync(key, value, options);
}
export async function getSecureItem(key: string) {
  const options = { keychainService: 'app.secure' } as SecureStore.SecureStoreOptions;
  return SecureStore.getItemAsync(key, options);
}
export async function deleteSecureItem(key: string) {
  await SecureStore.deleteItemAsync(key, { keychainService: 'app.secure' });
}

// 서버 인증용 PIN에서는 클라이언트에 PIN을 저장하지 않습니다.
// 단, 사용자 설정 상태를 위한 불리언 플래그만 저장합니다.
export async function setPinEnabled(enabled: boolean) {
  await setSecureItem(SECURE_KEYS.pinEnabled, enabled ? '1' : '0');
}

export async function getPinEnabled() {
  const v = await getSecureItem(SECURE_KEYS.pinEnabled);
  return v === '1';
}

export async function setLastEmail(email: string) {
  await setSecureItem(SECURE_KEYS.lastEmail, email);
}

export async function getLastEmail() {
  return getSecureItem(SECURE_KEYS.lastEmail);
}

export async function deleteLastEmail() {
  await deleteSecureItem(SECURE_KEYS.lastEmail);
}

/**
 * 실제 디바이스 정보 기반 고유 ID 생성 및 관리
 */
export async function getOrCreateDeviceId(): Promise<string> {
  let deviceId = await getSecureItem(SECURE_KEYS.deviceId);
  
  if (!deviceId) {
    // 실제 디바이스 정보로 고유 ID 생성
    deviceId = await generateRealDeviceId();
    await setSecureItem(SECURE_KEYS.deviceId, deviceId);
  }
  
  return deviceId;
}

export async function getDeviceId(): Promise<string | null> {
  return getSecureItem(SECURE_KEYS.deviceId);
}

export async function deleteDeviceId() {
  await deleteSecureItem(SECURE_KEYS.deviceId);
}

/**
 * 실제 디바이스 정보를 이용한 고유 ID 생성
 */
async function generateRealDeviceId(): Promise<string> {
  try {
    // 실제 디바이스 정보들 조합
    const deviceInfo = {
      osName: Device.osName || 'unknown',           // "iOS", "Android"
      osVersion: Device.osVersion || 'unknown',     // "17.1.1", "14"
      modelName: Device.modelName || 'unknown',     // "iPhone 15 Pro", "SM-G998N"
      brand: Device.brand || 'unknown',             // "Apple", "Samsung"
    };
    
    // 디바이스 정보를 조합하여 고유 ID 생성
    const combinedInfo = `${deviceInfo.osName}-${deviceInfo.brand}-${deviceInfo.modelName}-${deviceInfo.osVersion}`;
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 9);
    
    return `${combinedInfo}-${timestamp}-${randomSuffix}`.replace(/\s+/g, '_');
    
  } catch (error) {
    console.warn('Failed to get device info, using fallback:', error);
    // expo-device 사용 실패 시 fallback
    return 'device-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }
}

/**
 * 디바이스 정보 조회 (서버 전송용)
 */
export async function getDeviceInfo(): Promise<{
  deviceId: string;
  deviceName: string;
  platform: 'iOS' | 'Android';
  osVersion: string;
}> {
  try {
    const deviceId = await getOrCreateDeviceId();
    
    return {
      deviceId,
      deviceName: Device.modelName || 'Unknown Device',
      platform: Device.osName === 'iOS' ? 'iOS' : 'Android',
      osVersion: Device.osVersion || 'Unknown',
    };
    
  } catch (error) {
    console.warn('Failed to get device info:', error);
    const deviceId = await getOrCreateDeviceId();
    
    return {
      deviceId,
      deviceName: 'Unknown Device',
      platform: 'Android', // fallback
      osVersion: 'Unknown',
    };
  }
}


// 생체 인증이 필요한 읽기(예: refreshToken 잠금 해제)
export async function getSecureItemWithBiometry(key: string) {
  const options = {
    keychainService: 'app.secure',
    requireAuthentication: true,
    authenticationPrompt: '생체 인증으로 잠금을 해제하세요',
  } as SecureStore.SecureStoreOptions;
  return SecureStore.getItemAsync(key, options);
}