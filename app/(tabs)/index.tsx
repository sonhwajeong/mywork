import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

export default function HomeScreen() {
  return (
    <WebView
      source={{ uri: 'https://www.google.com' }}
      style={styles.webview}
    />
  );
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
  },
});