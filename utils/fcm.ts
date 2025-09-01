import messaging from '@react-native-firebase/messaging';
import { Alert } from 'react-native';
import { sendFCMTokenToServer } from '@/utils/api';

export class FCMService {
  /**
   * FCM 초기화 및 권한 요청
   */
  static async initialize(accessToken?: string) {
    try {
      // 알림 권한 요청
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        console.log('✅ FCM 권한 승인됨:', authStatus);
        
        // FCM 토큰 가져오기
        const fcmToken = await messaging().getToken();
        console.log('📱 FCM 토큰:', fcmToken);
        
        // 토큰을 서버에 전송
        await FCMService.sendTokenToServer(fcmToken, accessToken);
        
        return fcmToken;
      } else {
        console.log('❌ FCM 권한 거부됨');
        return null;
      }
    } catch (error) {
      console.error('FCM 초기화 실패:', error);
      return null;
    }
  }

  /**
   * FCM 토큰을 서버에 전송
   */
  static async sendTokenToServer(fcmToken: string, accessToken?: string) {
    try {
      const result = await sendFCMTokenToServer(fcmToken, accessToken);
      
      if (result.success) {
        console.log('✅ FCM 토큰 서버 전송 성공:', result.message);
      } else {
        console.error('❌ FCM 토큰 서버 전송 실패:', result.message);
      }
      
      return result;
    } catch (error) {
      console.error('❌ FCM 토큰 전송 중 오류:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'FCM 토큰 전송 실패'
      };
    }
  }

  /**
   * 포그라운드 메시지 리스너 설정
   */
  static setupForegroundListener() {
    const unsubscribe = messaging().onMessage(async (remoteMessage) => {
      console.log('📩 포그라운드에서 FCM 메시지 수신:', remoteMessage);
      
      // 알림 표시
      Alert.alert(
        remoteMessage.notification?.title || '알림',
        remoteMessage.notification?.body || '새 메시지가 도착했습니다.',
        [{ text: '확인' }]
      );
    });

    return unsubscribe;
  }

  /**
   * 백그라운드 메시지 핸들러 설정
   */
  static setupBackgroundHandler() {
    messaging().setBackgroundMessageHandler(async (remoteMessage) => {
      console.log('📩 백그라운드에서 FCM 메시지 처리:', remoteMessage);
    });
  }

  /**
   * 앱 상태별 알림 처리
   */
  static setupNotificationHandlers() {
    // 앱이 백그라운드에서 알림을 탭해서 열린 경우
    messaging().onNotificationOpenedApp((remoteMessage) => {
      console.log('📱 백그라운드에서 알림 탭으로 앱 열림:', remoteMessage);
    });

    // 앱이 완전히 종료된 상태에서 알림을 탭해서 열린 경우
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) {
          console.log('📱 종료 상태에서 알림 탭으로 앱 열림:', remoteMessage);
        }
      });
  }
}