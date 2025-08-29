import { Alert, Linking, Platform } from 'react-native';

// Android 생체인식/보안 화면으로 최대한 바로 이동
export async function openBiometricOrSecuritySettings() {
  if (Platform.OS !== 'android') return;

  const anyLinking = Linking as any;

  // 1) Android 11+ : 통합 생체 등록 화면
  // extra: BIOMETRIC_AUTHENTICATORS_ALLOWED = BIOMETRIC_STRONG | DEVICE_CREDENTIAL (15)
  try {
    if (typeof anyLinking?.sendIntent === 'function') {
      await anyLinking.sendIntent('android.settings.BIOMETRIC_ENROLL', [
        { key: 'android.provider.extra.BIOMETRIC_AUTHENTICATORS_ALLOWED', int: 15 },
      ]);
      return;
    }
  } catch (e) {
    // keep fallback
  }

  // 2) 보안 설정 최상위
  try {
    if (typeof anyLinking?.sendIntent === 'function') {
      await anyLinking.sendIntent('android.settings.SECURITY_SETTINGS');
      return;
    }
  } catch (e) {}

  // 3) (구버전 일부) 지문 등록 화면
  try {
    if (typeof anyLinking?.sendIntent === 'function') {
      await anyLinking.sendIntent('android.settings.FINGERPRINT_ENROLL');
      return;
    }
  } catch (e) {}

  // 4) intent URI로 한 번 더 시도 (기기 편차 큼)
  try {
    await Linking.openURL('intent:#Intent;action=android.settings.SECURITY_SETTINGS;end');
    return;
  } catch (e) {}

  // 5) 최종 폴백: 앱 설정(앱 정보)
  try {
    await Linking.openSettings();
  } catch (e: any) {
    Alert.alert('설정 열기 실패', e?.message || '설정 앱에서 직접 이동해 주세요.');
  }
}

// Android 지문 등록 화면을 우선적으로 시도
export async function openFingerprintEnrollFirst() {
  if (Platform.OS !== 'android') return;
  const anyLinking = Linking as any;
  try {
    if (typeof anyLinking?.sendIntent === 'function') {
      await anyLinking.sendIntent('android.settings.FINGERPRINT_ENROLL');
      return;
    }
  } catch (e) {}
  // 폴백: 일반 생체/보안 설정 경로로 진행
  await openBiometricOrSecuritySettings();
}


