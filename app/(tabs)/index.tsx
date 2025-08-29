import { ImageBackground, StyleSheet, View, TouchableOpacity } from 'react-native';
import { SearchBar } from '@/components/SearchBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppWebView from '@/components/AppWebView';
import { WEBVIEW_BASE_URL } from '@/constants/config';
import { ThemedText } from '@/components/ThemedText';
import { useState, useEffect } from 'react';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { resolveWebUrl } from '@/constants/config';
import { useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';

const HEADER_HEIGHT = 160;


export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { token, ready } = useAuth();
  const [webViewUrl, setWebViewUrl] = useState(`${WEBVIEW_BASE_URL}/`);
  const [webViewKey, setWebViewKey] = useState(0); // WebView 강제 새로고침용

  // 전역에서 호출 가능한 로그인 페이지 표시 함수 및 웹 메시지 전송 함수
  useEffect(() => {
    // @ts-ignore
    global.showLoginPage = () => {
      const BASE = WEBVIEW_BASE_URL.endsWith('/') ? WEBVIEW_BASE_URL.slice(0, -1) : WEBVIEW_BASE_URL;
      const loginUrl = resolveWebUrl(`${BASE}/login`);
      console.log('Showing login page:', loginUrl);
      setWebViewUrl(loginUrl);
    };

    // 웹으로 PIN 로그인 결과 전송 함수
    // @ts-ignore
    global.sendPinLoginResult = (result: any) => {
      const response = result.success ? {
        type: 'pinLoginSuccess',
        success: true,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt,
        user: result.user
      } : {
        type: 'pinLoginFailure',
        success: false,
        error: result.error
      };

      // AppWebView에 메시지 전송 (현재 활성화된 WebView에 전송)
      const jsCode = `
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(${JSON.stringify(response)}));
        }
        if (window.handlePinLoginResult) {
          window.handlePinLoginResult(${JSON.stringify(response)});
        }
        if (window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('pinLoginResult', {
            detail: ${JSON.stringify(response)}
          }));
        }
        true;
      `;

      // 현재 페이지의 WebView에 JavaScript 실행
      // 이는 AppWebView 컴포넌트를 통해 처리될 것임
      console.log('PIN login result to be sent:', response);
    };

    return () => {
      // @ts-ignore
      delete global.showLoginPage;
      // @ts-ignore
      delete global.sendPinLoginResult;
    };
  }, []);

  // 화면 포커스 시 URL 파라미터 확인
  useFocusEffect(
    useCallback(() => {
      if (params.showLogin === '1') {
        const BASE = WEBVIEW_BASE_URL.endsWith('/') ? WEBVIEW_BASE_URL.slice(0, -1) : WEBVIEW_BASE_URL;
        const loginUrl = resolveWebUrl(`${BASE}/login`);
        console.log('Params showLogin detected, setting URL to:', loginUrl);
        setWebViewUrl(loginUrl);
        // URL 파라미터 초기화
        router.setParams({ showLogin: undefined });
      }
    }, [params.showLogin])
  );

  // Bizverse 클릭 시 홈으로 이동
  const handleBizversePress = () => {
    setWebViewUrl(`${WEBVIEW_BASE_URL}/`);
  };

  // 로그아웃 상태 체크 및 WebView URL 동기화
  useEffect(() => {
    if (ready) {
      if (!token) {
        // 로그아웃 상태일 때는 홈 페이지로 리다이렉트 + WebView 새로고침
        console.log('🔓 Home tab: 로그아웃 상태 감지, 홈페이지로 이동 + WebView 재생성');
        setWebViewUrl(`${WEBVIEW_BASE_URL}/`);
        setWebViewKey(prev => prev + 1); // WebView 강제 재생성
      }
    }
  }, [token, ready]);

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('@/assets/images/splash.png')}
        resizeMode="cover"
        style={[styles.header, { paddingTop: insets.top + 12 }]}
        imageStyle={styles.headerImage}
      >
        <TouchableOpacity onPress={handleBizversePress}>
          <ThemedText type="title" style={styles.brand}>
            Bizverse
          </ThemedText>
        </TouchableOpacity>
        <View style={styles.searchWrap}>
          <SearchBar />
        </View>
      </ImageBackground>

      {ready ? (
        <AppWebView 
          key={webViewKey} 
          url={webViewUrl} 
          style={styles.webview} 
        />
      ) : (
        <View style={[styles.webview, { alignItems: 'center', justifyContent: 'center' }]}>
          <ThemedText>로딩 중...</ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    height: HEADER_HEIGHT,
    paddingTop: 24,
    paddingHorizontal: 16,
    justifyContent: 'flex-end',
    paddingBottom: 12,
  },
  headerImage: { opacity: 0.2 },
  brand: { fontSize: 28, fontWeight: '800', marginBottom: 8 },
  searchWrap: { },

  webview: { flex: 1 },
});