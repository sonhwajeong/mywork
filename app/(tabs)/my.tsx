import { router } from 'expo-router';
import { FlatList, TouchableOpacity, View, StyleSheet, Alert } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { SearchBar } from '@/components/SearchBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WEBVIEW_BASE_URL, resolveWebUrl } from '@/constants/config';
import { useAuth } from '@/hooks/useAuth';
import { fetchPinStatus } from '@/utils/api';
import { getLastEmail } from '@/utils/secure';
import { useEffect, useState } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform, Clipboard } from 'react-native';
import messaging from '@react-native-firebase/messaging';
// import { useAuth } from '@/hooks/useAuth';

type MenuItem = { key: string; title: string; url?: string };

const BASE = WEBVIEW_BASE_URL.endsWith('/') ? WEBVIEW_BASE_URL.slice(0, -1) : WEBVIEW_BASE_URL;

export default function MyScreen() {
    const insets = useSafeAreaInsets();
    const { user, token, logout, fetchLoginOptions, accessToken } = useAuth();
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [loginOptions, setLoginOptions] = useState<{ hasPin: boolean; hasPasskey: boolean; email: string } | null>(null);
    const [fcmToken, setFcmToken] = useState<string | null>(null);

    // FCM 토큰 가져오기
    useEffect(() => {
      const getFCMToken = async () => {
        try {
          const token = await messaging().getToken();
          setFcmToken(token);
          console.log('📱 FCM 토큰 받아옴:', token);
        } catch (error) {
          console.error('FCM 토큰 가져오기 실패:', error);
        }
      };

      getFCMToken();
    }, []);
    
    // 로그인 상태에 따라 메뉴 아이템 설정
    useEffect(() => {
      const BASE = WEBVIEW_BASE_URL.endsWith('/') ? WEBVIEW_BASE_URL.slice(0, -1) : WEBVIEW_BASE_URL;
      
      const setupMenuItems = async () => {
        if (token && user) {
          // 현재 로그인된 상태 - 로그인 옵션 조회
          try {
            const options = await fetchLoginOptions();
            setLoginOptions(options);
            
            const pinTitle = options?.hasPin ? 'PIN 로그인 설정 ✓' : 'PIN 로그인 설정';
            const biometricTitle = options?.hasPasskey ? '생체등록설정 ✓' : '생체등록설정';
            
            setMenuItems([
              { key: 'profile', title: `${user.email}님` },
              { key: 'easyLogin', title: pinTitle },
              { key: 'biometricSetup', title: biometricTitle },
              { key: 'fcmToken', title: 'FCM 토큰 보기' },
              { key: 'orders', title: '이전주문조회', url: resolveWebUrl(`${BASE}/order-history`) },
              { key: 'help', title: '고객센터', url: resolveWebUrl(`${BASE}/customer-center`) },
              { key: 'logout', title: '로그아웃' },
            ]);
          } catch (error) {
            console.error('Failed to fetch login options:', error);
            // 에러 발생 시 기본 메뉴 표시
            setMenuItems([
              { key: 'profile', title: `${user.email}님` },
              { key: 'easyLogin', title: 'PIN 로그인 설정' },
              { key: 'biometricSetup', title: '생체등록설정' },
              { key: 'fcmToken', title: 'FCM 토큰 보기' },
              { key: 'orders', title: '이전주문조회', url: resolveWebUrl(`${BASE}/order-history`) },
              { key: 'help', title: '고객센터', url: resolveWebUrl(`${BASE}/customer-center`) },
              { key: 'logout', title: '로그아웃' },
            ]);
          }
        } else {
          // 로그아웃 상태
          setLoginOptions(null);
          const baseMenu = [
            { key: 'login', title: '로그인' },
            { key: 'signup', title: '회원가입', url: resolveWebUrl(`${BASE}/signup`) },
          ];
          
          baseMenu.push({ key: 'fcmToken', title: 'FCM 토큰 보기' });
          baseMenu.push({ key: 'help', title: '고객센터', url: resolveWebUrl(`${BASE}/customer-center`) });
          
          setMenuItems(baseMenu);
        }
      };
      
      setupMenuItems();
    }, [token, user, accessToken]);
    
    const handleLogout = () => {
      Alert.alert(
        '로그아웃',
        '정말 로그아웃 하시겠습니까?',
        [
          {
            text: '취소',
            style: 'cancel',
          },
          {
            text: '로그아웃',
            onPress: async () => {
              try {
                await logout();
                Alert.alert('로그아웃', '로그아웃되었습니다.');
              } catch (error) {
                console.error('Logout error:', error);
                Alert.alert('오류', '로그아웃 중 오류가 발생했습니다.');
              }
            },
            style: 'destructive',
          },
        ]
      );
    };
    
    const handlePress = async (item: MenuItem) => {
        if (item.key === 'login') {
          // 홈 탭으로 먼저 이동
          router.push('/(tabs)' as any);
          // 잠시 후 로그인 페이지 표시
          setTimeout(() => {
            // @ts-ignore
            if (global.showLoginPage) {
              // @ts-ignore
              global.showLoginPage();
            }
          }, 100);
          return;
        }
        if (item.key === 'logout') {
          handleLogout();
          return;
        }
        if (item.key === 'profile') {
          // 프로필 클릭 시 아무 동작 안함 (단순 표시용)
          return;
        }
        if (item.key === 'easyLogin') {
          // 로그인된 상태에서만 PIN 설정 가능
          if (!token || !user) {
            Alert.alert(
              '로그인 필요',
              'PIN 로그인을 설정하려면 먼저 로그인해주세요.',
              [
                { text: '확인' }
              ]
            );
            return;
          }

          try {
            const status = await fetchPinStatus(user.email);
            if (status?.enabled) {
              router.push('/pin-unlock' as any);
            } else {
              router.push('/pin-setup' as any);
            }
          } catch {
            router.push('/pin-setup' as any);
          }
          return;
        }
        
        if (item.key === 'biometricSetup') {
          // 로그인된 상태에서만 생체등록설정 가능
          if (!token || !user) {
            Alert.alert(
              '로그인 필요',
              '생체등록설정을 하려면 먼저 로그인해주세요.',
              [
                { text: '확인' }
              ]
            );
            return;
          }

          try {
            // 현재 저장된 로그인 옵션 확인 (이미 조회된 상태)
            if (loginOptions?.hasPasskey) {
              Alert.alert(
                '생체인식 이미 설정됨',
                '생체인식이 이미 설정되어 있습니다.',
                [
                  { text: '확인' }
                ]
              );
              return;
            }

            // 생체인식 설정 진행
            Alert.alert(
              '생체등록설정',
              '생체인식을 등록하시겠습니까? 등록 후 생체인식으로 간편하게 로그인할 수 있습니다.',
              [
                {
                  text: '취소',
                  style: 'cancel',
                },
                {
                  text: '등록',
                  onPress: async () => {
                    try {
                      console.log('=== 생체인식 등록 시작 ===');
                      console.log('user:', user);
                      console.log('accessToken exists:', !!accessToken);

                      // accessToken 확인 (로그인 옵션을 가져올 수 있었다면 accessToken이 있어야 함)
                      if (!accessToken) {
                        console.error('accessToken is missing');
                        Alert.alert('오류', '인증 토큰이 없습니다. 다시 로그인해주세요.');
                        return;
                      }
                       // 생체인증 UI 표시
                      console.log('생체인증 UI 표시');
                      
                      const authResult = await LocalAuthentication.authenticateAsync({
                        promptMessage: '생체인식을 등록하기 위해 인증해주세요',
                        fallbackLabel: '취소',
                        disableDeviceFallback: false,
                      });
                      
                      console.log('생체인증 결과:', authResult);
                      if (!authResult.success) {
                        Alert.alert('취소', '생체인식 등록이 취소되었습니다.');
                        return;
                      }

                      // 서버에 생체인식 등록 요청
                      console.log('서버 API 호출 시작');
                      const { setupBiometricOnServer } = await import('@/utils/api');
                      const { getDeviceInfo } = await import('@/utils/secure');
                      
                      // 디바이스 정보 가져오기
                      const deviceInfo = await getDeviceInfo();
                      
                      // 플랫폼과 사용 가능한 생체인식에 따라 method 결정
                      let method: 'FACE_ID' | 'TOUCH_ID' | 'FINGERPRINT' = 'FINGERPRINT';
                      if (deviceInfo.platform === 'iOS') {
                        // iOS의 경우 Face ID 또는 Touch ID 확인
                        const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
                        if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
                          method = 'FACE_ID';
                        } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
                          method = 'TOUCH_ID';
                        }
                      } else {
                        // Android의 경우 기본적으로 지문 인식
                        method = 'FINGERPRINT';
                      }
                      
                      const payload = {
                        email: user.email,
                        deviceId: deviceInfo.deviceId,
                        deviceName: deviceInfo.deviceName,
                        platform: deviceInfo.platform,
                        method: method,
                      };
                      
                      console.log('API payload:', payload);
                      const result = await setupBiometricOnServer(payload, accessToken);
                      console.log('API 결과:', result);

                      if (result.success) {
                        Alert.alert('등록 완료', result.message || '생체인식이 성공적으로 등록되었습니다.');
                        // 등록 성공 후 로그인 옵션 새로고침
                        try {
                          const updatedOptions = await fetchLoginOptions();
                          setLoginOptions(updatedOptions);
                        } catch (optionsError) {
                          console.error('Failed to refresh login options:', optionsError);
                        }
                      } else {
                        Alert.alert('등록 실패', result.message || '생체인식 등록에 실패했습니다.');
                      }
                    } catch (error) {
                      console.error('Biometric setup error:', error);
                      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
                      Alert.alert('오류', `생체인식 등록 중 오류가 발생했습니다: ${errorMessage}`);
                    }
                  },
                },
              ]
            );
          } catch (error) {
            console.error('Login options fetch error:', error);
            Alert.alert('오류', '설정 정보를 가져오는데 실패했습니다.');
          }
          return;
        }
        
        if (item.key === 'fcmToken') {
          // FCM 토큰 보기 및 복사
          if (fcmToken) {
            Alert.alert(
              'FCM 토큰',
              fcmToken,
              [
                { text: '복사', onPress: () => {
                  Clipboard.setString(fcmToken);
                  Alert.alert('복사됨', 'FCM 토큰이 클립보드에 복사되었습니다.');
                }},
                { text: '닫기', style: 'cancel' }
              ]
            );
          } else {
            Alert.alert('알림', 'FCM 토큰을 가져오는 중입니다. 잠시 후 다시 시도해주세요.');
          }
          return;
        }
        
        if (item.url) {
          router.push(
            (`/webview?url=${encodeURIComponent(item.url)}&title=${encodeURIComponent(item.title)}`) as any
          );
        }
      };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }] }>
      <View style={{ padding: 16 }}>
        <SearchBar />
      </View>

      <FlatList
        data={menuItems}
        keyExtractor={(item) => item.key}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={[
              styles.row,
              item.key === 'profile' && styles.profileRow,
              item.key === 'logout' && styles.logoutRow
            ]} 
            onPress={() => handlePress(item)}
            disabled={item.key === 'profile'}
          >
            <ThemedText 
              style={[
                item.key === 'profile' && styles.profileText,
                item.key === 'logout' && styles.logoutText
              ]}
            >
              {item.title}
            </ThemedText>
          </TouchableOpacity>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: 'transparent',
  },
  profileRow: {
    backgroundColor: '#f3f4f6',
  },
  logoutRow: {
    backgroundColor: 'transparent',
  },
  profileText: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  logoutText: {
    color: '#dc2626',
  },
  separator: { height: 1, backgroundColor: '#e5e5e5' },
});