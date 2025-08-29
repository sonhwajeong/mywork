package com.yourcompany.test2

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import androidx.biometric.BiometricManager

class BiometricEnrollModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "BiometricEnroll"

  @ReactMethod
  fun openEnroll(promise: Promise) {
    try {
      val activity: Activity? = currentActivity
      val ctx = activity ?: reactApplicationContext
      val intents = mutableListOf<Intent>()
      
      // API 30+: 통합 생체 등록
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        intents.add(Intent(Settings.ACTION_BIOMETRIC_ENROLL).apply {
          putExtra(
            Settings.EXTRA_BIOMETRIC_AUTHENTICATORS_ALLOWED,
            BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
          )
        })
      }
      
      // API 28+: 지문 등록 화면
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        intents.add(Intent(Settings.ACTION_FINGERPRINT_ENROLL))
      }
      
      // 보안 설정 폴백
      intents.add(Intent(Settings.ACTION_SECURITY_SETTINGS))
      intents.add(Intent(Settings.ACTION_SETTINGS))

      // 인텐트 실행
      var launched = false
      for (intent in intents) {
        try {
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          ctx.startActivity(intent)
          launched = true
          break
        } catch (e: Exception) {
          // 다음 인텐트 시도
        }
      }
      
      if (launched) {
        promise.resolve(true)
      } else {
        promise.reject("ENROLL_NOT_AVAILABLE", "No settings activity could be launched")
      }
    } catch (e: Exception) {
      promise.reject("ENROLL_ERROR", e.message ?: "Unknown error")
    }
  }
}