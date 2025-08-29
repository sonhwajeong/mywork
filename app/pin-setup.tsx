import { useState, useEffect } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { setPinEnabled } from '@/utils/secure';
import { useAuth } from '@/hooks/useAuth';
import { setPinOnServer, AuthApiError } from '@/utils/api';

function shuffle<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function PinSetupScreen() {
  const [pin, setPinState] = useState<string>('');
  const [confirmPin, setConfirmPinState] = useState<string>('');
  const [step, setStep] = useState<'first' | 'confirm'>('first'); // PIN 입력 단계
  const [keys, setKeys] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    const digits = ['0','1','2','3','4','5','6','7','8','9'];
    setKeys([...shuffle(digits), 'back']);
  }, []);

  const onKey = (d: string) => {
    if (isLoading) return; // 로딩 중에는 키 입력 차단
    
    if (d === 'back') {
      if (step === 'first') {
        setPinState(p => p.slice(0, -1));
      } else {
        setConfirmPinState(p => p.slice(0, -1));
      }
      setError(null); // 에러 메시지 초기화
      return;
    }
    
    if (step === 'first') {
      if (pin.length >= 6) return;
      const newPin = pin + d;
      setPinState(newPin);
      setError(null);
      
      // 첫 번째 PIN 6자리 완성되면 확인 단계로
      if (newPin.length === 6) {
        setStep('confirm');
        // 키패드 섞기
        const digits = ['0','1','2','3','4','5','6','7','8','9'];
        setKeys([...shuffle(digits), 'back']);
      }
    } else {
      if (confirmPin.length >= 6) return;
      const newConfirmPin = confirmPin + d;
      setConfirmPinState(newConfirmPin);
      setError(null);
      
      // 두 번째 PIN 6자리 완성되면 확인
      if (newConfirmPin.length === 6) {
        if (pin === newConfirmPin) {
          onSubmit(pin);
        } else {
          setError('PIN이 일치하지 않습니다. 다시 입력해주세요.');
          // 다시 첫 번째 단계로
          setPinState('');
          setConfirmPinState('');
          setStep('first');
          // 키패드 섞기
          const digits = ['0','1','2','3','4','5','6','7','8','9'];
          setKeys([...shuffle(digits), 'back']);
        }
      }
    }
  };

  const onSubmit = async (pinCode: string) => {
    if (pinCode.length !== 6) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const email = user?.email ?? 'user@example.com';
      
      // PIN 유효성 검사
      if (!pinCode.match(/^\d{6}$/)) {
        throw new Error('PIN은 6자리 숫자여야 합니다.');
      }
      
      console.log('PIN 설정 시작:', { email, pinLength: pinCode.length });
      
      console.log('서버 API 호출 시작...');
      
      // 디바이스 정보 가져오기
      const { getDeviceInfo } = await import('@/utils/secure');
      const deviceInfo = await getDeviceInfo();
      
      // 서버에 PIN 설정 (원본 PIN 전달 - API 함수에서 해시화 후 서버로 전송)
      const result = await setPinOnServer(email, pinCode, deviceInfo.deviceId, deviceInfo.platform);
      console.log('서버 API 호출 완료!', result);
      
      console.log('로컬 PIN 활성화 저장 시작...');
      // 로컬에 PIN 활성화 상태 저장
      await setPinEnabled(true);
      console.log('로컬 PIN 활성화 저장 완료!');
      
      console.log('성공 Alert 표시 시작...');
      // 성공 알림 (서버 성공 시에만)
      Alert.alert(
        'PIN 설정 완료', 
        result.message || 'PIN 번호가 성공적으로 설정되었습니다.',
        [
          {
            text: '확인',
            onPress: () => {
              console.log('사용자가 확인 버튼 클릭, WebView refresh 후 홈으로 이동');
              
              // WebView에 설정 완료 메시지 전송 (새로고침 트리거)
              if ((global as any).webViewHandleSettingComplete) {
                (global as any).webViewHandleSettingComplete({
                  type: 'pinSetupComplete',
                  success: true,
                  message: 'PIN 설정이 완료되었습니다.'
                });
              }
              
              router.replace('/(tabs)' as any);
            }
          }
        ]
      );
      
    } catch (e) {
      console.error('PIN setup error:', e);
      
      // 에러 메시지 처리
      let errorMessage = 'PIN 설정에 실패했습니다.';
      if (e instanceof AuthApiError) {
        if (e.message.includes('이미 설정된')) {
          errorMessage = '이미 PIN이 설정되어 있습니다.';
        } else if (e.message.includes('형식')) {
          errorMessage = 'PIN 형식이 올바르지 않습니다.';
        } else {
          errorMessage = e.message;
        }
      } else if (e instanceof Error) {
        errorMessage = e.message;
      }
      
      setError(errorMessage);
      setPinState(''); // PIN 초기화
      
    } finally {
      setIsLoading(false);
    }
  };

  

  return (
    <>
      <Stack.Screen options={{ title: 'PIN 비밀번호 설정', headerShown: true }} />
      <View style={{ flex:1, padding:24, justifyContent:'space-between' }}>
        <View style={{ alignItems:'center', gap:8, marginTop:24 }}>
          <Text style={{ fontSize:22, fontWeight:'700' }}>PIN 비밀번호 설정</Text>
          <Text style={{ color:'#6b7280' }}>
            {step === 'first' ? '6자리 숫자를 입력하세요' : 'PIN을 다시 한 번 입력하세요'}
          </Text>
          {isLoading && <Text style={{ color:'#059669' }}>PIN을 설정 중입니다...</Text>}
          {error && <Text style={{ color:'#dc2626', textAlign:'center' }}>{error}</Text>}
          <View style={{ flexDirection:'row', gap:12, marginTop:16 }}>
            {[0,1,2,3,4,5].map(i => {
              const currentPin = step === 'first' ? pin : confirmPin;
              return (
                <View 
                  key={i} 
                  style={{ 
                    width:12, 
                    height:12, 
                    borderRadius:6, 
                    backgroundColor: i < currentPin.length ? '#1e3a8a' : '#d1d5db' 
                  }} 
                />
              );
            })}
          </View>
        </View>
        <View style={{ alignItems:'center' }}>
          <View style={{ width:'100%', backgroundColor:'#0b3b82', borderTopLeftRadius:16, borderTopRightRadius:16, paddingVertical:16 }}>
            <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-around' }}>
              {keys.map(k => (
                <Pressable 
                  key={k} 
                  onPress={() => onKey(k)} 
                  disabled={isLoading}
                  style={{ 
                    width:'30%', 
                    paddingVertical:18, 
                    alignItems:'center',
                    opacity: isLoading ? 0.5 : 1 
                  }}
                >
                  <Text style={{ color:'white', fontSize:22 }}>{k === 'back' ? '⌫' : k}</Text>
                </Pressable>
              ))}
            </View>
            {((step === 'first' && pin.length === 6) || (step === 'confirm' && confirmPin.length === 6)) && (
              <View style={{ marginTop:8, alignSelf:'center', paddingVertical:12, paddingHorizontal:24, borderRadius:8, backgroundColor: isLoading ? '#9ca3af' : 'white' }}>
                <Text style={{ color:'#0b3b82', fontWeight:'700' }}>
                  {isLoading ? '설정 중...' : step === 'first' ? '확인 단계로 이동' : '확인 중...'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </>
  );
}


