import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/hooks/useAuth';
import { getLastEmail, getDeviceInfo } from '@/utils/secure';
import { Platform, Alert } from 'react-native';
import { fetchPinStatus } from '@/utils/api';

function shuffle<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function PinUnlockScreen() {
  const [pin, setPinState] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const router = useRouter();
  const { pinLogin, lastWebLoginMessage, setLastWebLoginMessage, user, token } = useAuth();

  const reshuffle = () => {
    const digits = ['0','1','2','3','4','5','6','7','8','9'];
    setKeys([...shuffle(digits), 'back']);
  };

  useEffect(() => {
    reshuffle();
  }, []);

  useFocusEffect(
    useCallback(() => {
      reshuffle();
    }, [])
  );

  const onKey = (d: string) => {
    if (d === 'back') {
      setPinState(p => p.slice(0, -1));
      setError(null);
      return;
    }
    if (pin.length >= 6) return;
    const next = pin + d;
    setPinState(next);
    if (next.length === 6) {
      onSubmit(next);
    }
  };

  const onSubmit = async (code: string) => {
    try {
      // 디바이스 정보 가져오기
      const deviceInfo = await getDeviceInfo();
      
      // 이메일 정보 가져오기 (useAuth의 pinLogin 함수는 identifier(email)를 첫 번째 매개변수로 받음)
      const email = await getLastEmail();
      if (!email) {
        throw new Error('이메일 정보가 없습니다. 먼저 일반 로그인을 완료해주세요.');
      }
      
      const loginResult = await pinLogin(code, deviceInfo.deviceId, deviceInfo.platform);
      
      console.log('PIN 로그인 결과:', loginResult);
      
      if (!loginResult.success) {
        setError(loginResult.error || 'PIN 로그인에 실패했습니다.');
        setPinState('');
        reshuffle();
        return;
      }

      // PIN 로그인 성공 시 WebView에서 온 요청인지 확인
      if (lastWebLoginMessage?.type === 'PIN_LOGIN_REQUEST') {
     //   Alert.alert('PIN 로그인 성공', `WebView 요청 처리 중...\nhandler 존재: ${!!global.handlePinLoginResult}`);
        
        // 웹으로 PIN 로그인 결과 전송 (AppWebView에 등록된 핸들러 호출)
        console.log('🔍 PIN 성공 - 전역 핸들러 상태:', {
          handlerExists: !!(global as any).webViewHandlePinLoginResult,
          handlerType: typeof (global as any).webViewHandlePinLoginResult,
          globalKeys: Object.keys(global).filter(k => k.includes('webView'))
        });
        
        // @ts-ignore
        if (global.webViewHandlePinLoginResult) {
          const resultData = {
            success: true,
            accessToken: loginResult.accessToken,
            refreshToken: loginResult.refreshToken,
            expiresAt: loginResult.expiresAt,
            user: loginResult.user
          };
          
          console.log('🎯 PIN 성공 - 핸들러 호출 시작:', resultData);
          
          // @ts-ignore
          global.webViewHandlePinLoginResult(resultData);
          
          console.log('✅ PIN 성공 - 핸들러 호출 완료');
        } else {
          console.error('❌ 핸들러 없음: global.webViewHandlePinLoginResult가 등록되지 않았습니다.');
          console.log('🔍 현재 global 객체의 webView 관련 속성들:', 
            Object.keys(global).filter(k => k.toLowerCase().includes('webview') || k.toLowerCase().includes('pin'))
          );
        }
        
        // WebView로 다시 돌아가기
        router.back();
        
        // 기존 WebLoginMessage 방식도 유지 (호환성을 위해)
        setLastWebLoginMessage({
          type: 'loginSuccess',
          success: true,
          accessToken: loginResult.accessToken || '',
          refreshToken: loginResult.refreshToken || '',
          expiresAt: loginResult.expiresAt || Date.now() + 3600000,
          user: loginResult.user
        });
      } else {
        // 일반 PIN 로그인인 경우 홈으로 이동
        router.replace('/(tabs)' as any);
      }
    } catch (e) {
      console.error('PIN login error:', e);
      
      // 특별한 에러 코드들 우선 처리
      if (e instanceof Error) {
        if (e.message === 'PIN_SETUP_REQUIRED') {
          Alert.alert(
            'PIN 설정 필요',
            'PIN이 설정되어 있지 않습니다. PIN을 먼저 설정해주세요.',
            [
              { text: '확인', onPress: () => router.push('/pin-setup' as any) }
            ]
          );
          return;
        }
        
        if (e.message.includes('먼저 일반 로그인을 완료해야')) {
          // 웹에서 온 요청이면 실패 결과도 전송
          if (lastWebLoginMessage?.type === 'PIN_LOGIN_REQUEST') {
            // @ts-ignore
            if (global.webViewHandlePinLoginResult) {
              // @ts-ignore
              global.webViewHandlePinLoginResult({ 
                success: false, 
                error: '먼저 일반 로그인을 완료해야 합니다.' 
              });
            }
            router.back();
            return;
          }
          
          Alert.alert(
            '일반 로그인 필요',
            'PIN 로그인을 사용하려면 먼저 일반 로그인을 완료해야 합니다.',
            [
              { text: '확인', onPress: () => router.replace('/(tabs)' as any) }
            ]
          );
          return;
        }
      }
      
      // 에러 메시지를 더 구체적으로 처리
      let errorMessage = 'PIN이 일치하지 않습니다';
      if (e instanceof Error) {
        if (e.message.includes('PIN이 올바르지 않거나')) {
          errorMessage = 'PIN이 올바르지 않습니다';
        } else if (e.message.includes('PIN은 필수입니다')) {
          errorMessage = 'PIN을 입력해주세요';
        } else if (e.message.includes('PIN은 4-8자리 숫자여야 합니다')) {
          errorMessage = 'PIN은 4-8자리 숫자여야 합니다';
        } else if (e.message.includes('이메일은 필수입니다')) {
          errorMessage = '이메일 정보가 없습니다';
        } else {
          errorMessage = 'PIN 로그인에 실패했습니다';
        }
      }
      
      // 웹에서 온 요청이면 실패 결과도 전송
      if (lastWebLoginMessage?.type === 'PIN_LOGIN_REQUEST') {
        // @ts-ignore
        if (global.webViewHandlePinLoginResult) {
          // @ts-ignore
          global.webViewHandlePinLoginResult({ 
            success: false, 
            error: errorMessage 
          });
        }
        router.back();
        return;
      }
      
      setError(errorMessage);
      setPinState('');
      reshuffle();
    }
  };

  

  return (
    <>
      <Stack.Screen options={{ title: 'PIN 잠금 해제', headerShown: true }} />
      <View style={{ flex:1, padding:24, justifyContent:'space-between' }}>
        <View style={{ alignItems:'center', gap:8, marginTop:24 }}>
          <Text style={{ fontSize:22, fontWeight:'700' }}>PIN 입력</Text>
          {!!error && <Text style={{ color:'#dc2626' }}>{error}</Text>}
          <View style={{ flexDirection:'row', gap:12, marginTop:16 }}>
            {[0,1,2,3,4,5].map(i => (
              <View key={i} style={{ width:12, height:12, borderRadius:6, backgroundColor: i < pin.length ? '#1e3a8a' : '#d1d5db' }} />
            ))}
          </View>
        </View>
        <View style={{ alignItems:'center' }}>
          <View style={{ width:'100%', backgroundColor:'#0b3b82', borderTopLeftRadius:16, borderTopRightRadius:16, paddingVertical:16 }}>
            <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-around' }}>
              {keys.map(k => (
                <Pressable key={k} onPress={() => onKey(k)} style={{ width:'30%', paddingVertical:18, alignItems:'center' }}>
                  <Text style={{ color:'white', fontSize:22 }}>{k === 'back' ? '⌫' : k}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </View>
    </>
  );
}


