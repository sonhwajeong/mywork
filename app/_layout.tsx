import 'react-native-reanimated';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from '@/hooks/useColorScheme';

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

  if (!loaded) {
    return null;
  }

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
  const { ready, hasStoredSession, token, pinEnabled } = useAuth();

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