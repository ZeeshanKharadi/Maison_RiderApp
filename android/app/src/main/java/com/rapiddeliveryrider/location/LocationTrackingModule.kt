package com.rapiddeliveryrider.location

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class LocationTrackingModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "LocationTracking"

  @ReactMethod
  fun start(promise: Promise) {
    try {
      val intent = Intent(reactContext, LocationTrackingService::class.java).apply {
        action = LocationTrackingService.ACTION_START
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("START_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      val intent = Intent(reactContext, LocationTrackingService::class.java).apply {
        action = LocationTrackingService.ACTION_STOP
      }
      reactContext.startService(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("STOP_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required for RN NativeEventEmitter
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required for RN NativeEventEmitter
  }

  companion object {
    @Volatile
    private var emitContext: ReactApplicationContext? = null

    fun attach(context: ReactApplicationContext) {
      emitContext = context
    }

    fun emitLocation(latitude: Double, longitude: Double, accuracy: Float, time: Long) {
      val ctx = emitContext ?: return
      if (!ctx.hasActiveReactInstance()) return
      val map = Arguments.createMap().apply {
        putDouble("latitude", latitude)
        putDouble("longitude", longitude)
        putDouble("accuracy", accuracy.toDouble())
        putDouble("timestamp", time.toDouble())
      }
      ctx
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("LocationTrackingUpdate", map)
    }
  }

  init {
    attach(reactContext)
  }
}
