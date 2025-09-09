import 'react-native-reanimated';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { FCMService } from '@/utils/fcm';

// 전역 에러 핸들러 설정
if (__DEV__) {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    console.log('🚨 CONSOLE ERROR:', ...args);
    originalConsoleError(...args);
  };

  // Unhandled Promise rejection 핸들러
  const unhandledRejectionHandler = (event: any) => {
    console.error('🚨 UNHANDLED PROMISE REJECTION:', event.reason);
    console.error('🚨 Promise:', event.promise);
  };

  // React Native에서 글로벌 에러 핸들링
  if (typeof global !== 'undefined') {
    global.addEventListener?.('unhandledrejection', unhandledRejectionHandler);
    
    // ErrorUtils 사용 (React Native 전용)
    const ErrorUtils = require('react-native/Libraries/polyfills/ErrorUtils');
    const originalGlobalHandler = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error: any, isFatal: boolean) => {
      console.error('🚨 GLOBAL ERROR HANDLER:', { error, isFatal });
      console.error('🚨 Error message:', error?.message);
      console.error('🚨 Error stack:', error?.stack);
      originalGlobalHandler(error, isFatal);
    });
  }
}
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { useRouter } from 'expo-router';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();
export default function RootLayout() {
  const [loaded, error] = useFonts({
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // 폰트 로드 전에도 AuthProvider/GuardedStack가 마운트되어 인증 초기화가 먼저 실행됨
  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <GuardedStack />
          <StatusBar style="auto" />
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

function GuardedStack() {
  const router = useRouter();
  const { ready, hasStoredSession, token, pinEnabled, initState } = useAuth();

  // 초기화가 완료되지 않은 경우 로딩 화면 표시
  if (!ready) {
    return (
      <Stack>
        <Stack.Screen 
          name="loading" 
          options={{ headerShown: false }}
          component={() => (
            <View style={{ 
              flex: 1, 
              justifyContent: 'center', 
              alignItems: 'center', 
              backgroundColor: '#fff' 
            }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '500' }}>앱을 초기화하는 중...</Text>
                <Text style={{ marginTop: 10, fontSize: 14, color: '#666' }}>
                  {initState.step === 'starting' && '시작 중...'}
                  {initState.step === 'device' && '디바이스 정보 로드 중...'}
                  {initState.step === 'tokens' && '저장된 토큰 확인 중...'}
                  {initState.step === 'validation' && '토큰 검증 중...'}
                  {initState.step === 'timeout' && '⚠️ 초기화 시간 초과'}
                  {initState.step === 'error' && `❌ 오류: ${initState.error}`}
                </Text>
                {(initState.step === 'timeout' || initState.step === 'error') && (
                  <TouchableOpacity 
                    onPress={() => {
                      // React Native에서는 앱 재시작을 위해 다른 방법 필요
                      console.log('앱 재시작 요청됨');
                    }}
                    style={{ 
                      marginTop: 20, 
                      paddingVertical: 10,
                      paddingHorizontal: 20,
                      backgroundColor: '#007AFF', 
                      borderRadius: 8 
                    }}
                  >
                    <Text style={{ color: 'white', fontWeight: '500' }}>
                      다시 시도
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      </Stack>
    );
  }

  // 로그인 상태 체크는 각 탭에서 개별적으로 처리

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      
      {/* login/index는 제거됨 */}
      
      <Stack.Screen name="biometric-login" options={{ headerShown: true }} />
      <Stack.Screen name="pin-setup" options={{ headerShown: true }} />
      <Stack.Screen name="pin-unlock" options={{ headerShown: true }} />
      
    </Stack>
  );
}