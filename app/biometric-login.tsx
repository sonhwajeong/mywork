import { View, Text, Pressable, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useMemo, useState } from 'react';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { hasPasskeySupport, getPasskeyAssertion } from '@/utils/passkeys';
import { useAuth } from '@/hooks/useAuth';
import * as LocalAuthentication from 'expo-local-authentication';

export default function PasskeyScreen() {
  const router = useRouter();
  const { user, completeLogin, biometricLogin } = useAuth();
  const params = useLocalSearchParams<{ auto?: string; action?: string; identifier?: string; mode?: string }>();
  const [autoMode, setAutoMode] = useState<boolean>(params.auto === '1' || params.action === 'login');
  const [identifier, setIdentifier] = useState<string>(typeof params.identifier === 'string' ? params.identifier : '');
  const mode = typeof params.mode === 'string' ? params.mode : 'ul';
  // 기본을 usernameless로 사용. 필요 시 mode=id 로 identifier-first 사용 가능
  const useUsernameless = mode !== 'id';

  const register = async () => {
    // 생체인증 하드웨어 및 등록 상태 확인
    const hasHw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    
    if (!hasHw) {
      Alert.alert('생체인증 미지원', '이 기기는 생체인증 하드웨어가 없어 패스키 등록을 사용할 수 없습니다.');
      return;
    }
    
    if (!enrolled) {
      Alert.alert('생체인증 미설정', '앱 설정에서 생체인증을 등록한 뒤 다시 시도해 주세요.');
      return;
    }
    
    if (!hasPasskeySupport()) {
      Alert.alert('패스키 미지원', '이 기기에서 패스키가 지원되지 않습니다.');
      // 개발 모드에서만 모의 진행 허용
      if (!__DEV__) {
        return;
      }
    }
    
    try {
      Alert.alert('안내', '이 앱에서는 패스키 등록을 지원하지 않습니다. 생체인증 등록 후 로그인만 이용해 주세요.');
    } catch (e: any) {
      Alert.alert('등록 실패', e?.message || '오류가 발생했습니다');
    }
  };

  // 생체인식 로그인: 생체인증 후 서버 API로 리프레시 토큰 받아오기
  const login = async () => {
    // 생체인증 하드웨어 및 등록 상태 확인
    const hasHw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    
    if (!hasHw) {
      Alert.alert('생체인증 미지원', '이 기기는 생체인증을 지원하지 않습니다.');
      return;
    }
    
    if (!enrolled) {
      Alert.alert('생체인증 미설정', '기기 설정에서 생체인증을 등록한 뒤 다시 시도해 주세요.');
      return;
    }
    
    try {
      console.log('생체인증 시작');
      
      // 생체 인증 실행
      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: '생체인증으로 로그인하세요',
        fallbackLabel: '취소',
        disableDeviceFallback: false,
      });
      
      if (!authResult.success) {
        Alert.alert('인증 취소', '생체인증이 취소되었습니다.');
        if (autoMode) setAutoMode(false);
        return;
      }

      console.log('생체인증 성공, 서버 로그인 API 호출');
      
      // useAuth의 biometricLogin 사용하여 서버에서 리프레시 토큰 받아오기
      const result = await biometricLogin();
      
      if (result.success) {
        // WebView에서 호출된 경우 결과 전달
        if ((global as any).webViewHandleBiometricLoginResult) {
          console.log('생체인증 성공 결과를 WebView에 전달');
          (global as any).webViewHandleBiometricLoginResult({
            success: true,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresAt: result.expiresAt,
            user: result.user
          });
          router.back(); // WebView로 돌아가기
        } else {
          Alert.alert('로그인 성공', '생체인증 로그인이 완료되었습니다.');
          router.replace('/(tabs)' as any);
        }
      } else {
        // WebView에서 호출된 경우 실패 결과 전달
        if ((global as any).webViewHandleBiometricLoginResult) {
          console.log('생체인증 실패 결과를 WebView에 전달');
          (global as any).webViewHandleBiometricLoginResult({
            success: false,
            error: result.error || '생체인증 로그인에 실패했습니다.'
          });
          router.back(); // WebView로 돌아가기
        } else {
          Alert.alert('로그인 실패', result.error || '생체인증 로그인에 실패했습니다.');
          if (autoMode) setAutoMode(false);
        }
      }
      
    } catch (e: any) {
      console.error('생체인증 로그인 오류:', e);
      const msg = e?.message || '';
      const name = e?.name || '';
      const isUserCancel = /AbortError|NotAllowedError|cancel|canceled|user/i.test(`${name} ${msg}`);
      
      // WebView에서 호출된 경우 에러 결과 전달
      if ((global as any).webViewHandleBiometricLoginResult) {
        console.log('생체인증 에러 결과를 WebView에 전달');
        (global as any).webViewHandleBiometricLoginResult({
          success: false,
          error: isUserCancel ? '생체인증이 취소되었습니다.' : (msg || '오류가 발생했습니다')
        });
        router.back();
        return;
      }
      
      if (isUserCancel) {
        Alert.alert('취소됨', '로그인이 취소되었습니다.');
        if (autoMode) setAutoMode(false);
        return;
      }
      Alert.alert('로그인 실패', msg || '오류가 발생했습니다');
      if (autoMode) setAutoMode(false);
    }
  };

  // auto=1 또는 action에 따라 자동 수행
  useEffect(() => {
    if (autoMode) {
      if (!useUsernameless && !identifier) {
        // identifier-first 모드인데 식별자가 없으면 자동 모드 해제하고 UI를 노출
        setAutoMode(false);
        return;
      }
      login();
      return;
    }
    // 등록은 이 앱에서 미지원
  }, [autoMode, params]);

  const auto = autoMode;
  const action = params.action;

  return (
    <>
      <Stack.Screen options={{ title: '생체인증 로그인', headerShown: true }} />
      <SafeAreaView style={{ flex:1 }}>
        <View style={{ padding:24, gap:12 }}>
          <Text style={{ fontSize:18, fontWeight:'700' }}>생체인증 로그인</Text>
        {!auto && (
              <Pressable onPress={login} style={{ backgroundColor:'#0b3b82', padding:16, borderRadius:8 }}>
                <Text style={{ color:'white', textAlign:'center', fontWeight:'700' }}>생체인증으로 로그인</Text>
              </Pressable>
        )}
        {auto && (
          <Text style={{ color:'#6b7280' }}>
            생체인증 확인 후 로그인 중...
          </Text>
        )}
          <Text style={{ color:'#6b7280' }}>
            지문, Face ID 또는 기기 PIN으로 간편하게 로그인하세요.
          </Text>
        </View>
      </SafeAreaView>
    </>
  );
}


