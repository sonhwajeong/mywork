import { useLocalSearchParams, Stack } from 'expo-router';
import { StyleSheet } from 'react-native';
import AppWebView from '@/components/AppWebView';
import { WEBVIEW_BASE_URL, resolveWebUrl } from '@/constants/config';

export default function CommonWebViewScreen() {
  const { url, title } = useLocalSearchParams<{ url?: string; title?: string }>();
  const safeUrl = typeof url === 'string' ? resolveWebUrl(url) : WEBVIEW_BASE_URL;
  const screenTitle = typeof title === 'string' ? title : 'Web';

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: screenTitle }} />
      <AppWebView url={safeUrl} style={styles.webview} />
    </>
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1 },
});



