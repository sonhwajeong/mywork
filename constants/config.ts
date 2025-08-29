import { Platform } from 'react-native';

const DEFAULT_WEBVIEW_BASE_URL = 'http://172.16.2.84:3000/';
const ENV_WEBVIEW_BASE_URL = process.env.EXPO_PUBLIC_WEBVIEW_BASE_URL as string | undefined;

function normalizeLocalhost(url: string): string {
  if (!url) return url;
  if (Platform.OS === 'android') {
    return url
      .replace('http://localhost', 'http://10.0.2.2')
      .replace('https://localhost', 'https://10.0.2.2');
  }
  return url;
}

export const WEBVIEW_BASE_URL = normalizeLocalhost(ENV_WEBVIEW_BASE_URL ?? DEFAULT_WEBVIEW_BASE_URL);

export function resolveWebUrl(url: string): string {
  return normalizeLocalhost(url);
}


