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
        
        // FCM 토큰 가져오기
        const fcmToken = await messaging().getToken();
        
        // 토큰을 서버에 전송
        await FCMService.sendTokenToServer(fcmToken, accessToken);
        
        return fcmToken;
      } else {
        return null;
      }
    } catch (error) {
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
      } else {
      }
      
      return result;
    } catch (error) {
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
    });
  }

  /**
   * 앱 상태별 알림 처리
   */
  static setupNotificationHandlers() {
    // 앱이 백그라운드에서 알림을 탭해서 열린 경우
    messaging().onNotificationOpenedApp((remoteMessage) => {
    });

    // 앱이 완전히 종료된 상태에서 알림을 탭해서 열린 경우
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) {
        }
      });
  }
}