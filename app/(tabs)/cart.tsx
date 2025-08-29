import { ImageBackground, StyleSheet, View, TouchableOpacity } from 'react-native';
import { SearchBar } from '@/components/SearchBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppWebView from '@/components/AppWebView';
import { WEBVIEW_BASE_URL } from '@/constants/config';
import { ThemedText } from '@/components/ThemedText';
import { useAuth } from '@/hooks/useAuth';
import { useRef } from 'react';
import { useRouter } from 'expo-router';

const HEADER_HEIGHT = 160;

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const { token, ready } = useAuth();
  const webViewRef = useRef<any>(null);
  const router = useRouter();

  if (!ready) {
    return (
      <View style={styles.container}>
        <ImageBackground
          source={require('@/assets/images/splash.png')}
          resizeMode="cover"
          style={[styles.header, { paddingTop: insets.top + 12 }]}
          imageStyle={styles.headerImage}
        >
          <ThemedText type="title" style={styles.brand}>
            Bizverse
          </ThemedText>
          <View style={styles.searchWrap}>
            <SearchBar />
          </View>
        </ImageBackground>
        <View style={[styles.webview, { alignItems: 'center', justifyContent: 'center' }]}>
          <ThemedText>로딩 중...</ThemedText>
        </View>
      </View>
    );
  }

  if (!token) {
    return (
      <View style={styles.container}>
        <ImageBackground
          source={require('@/assets/images/splash.png')}
          resizeMode="cover"
          style={[styles.header, { paddingTop: insets.top + 12 }]}
          imageStyle={styles.headerImage}
        >
          <ThemedText type="title" style={styles.brand}>
            Bizverse
          </ThemedText>
          <View style={styles.searchWrap}>
            <SearchBar />
          </View>
        </ImageBackground>
        <View style={[styles.webview, { alignItems: 'center', justifyContent: 'center' }]}>
          <ThemedText style={{ fontSize: 16, marginBottom: 10 }}>로그인이 필요합니다</ThemedText>
          <ThemedText>장바구니를 이용하려면 로그인해주세요</ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('@/assets/images/splash.png')}
        resizeMode="cover"
        style={[styles.header, { paddingTop: insets.top + 12 }]}
        imageStyle={styles.headerImage}
      >
        <ThemedText type="title" style={styles.brand}>
          Bizverse
        </ThemedText>
        <View style={styles.searchWrap}>
          <SearchBar />
        </View>
      </ImageBackground>

      <AppWebView url={`${WEBVIEW_BASE_URL}/cart`} style={styles.webview} />
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



