package com.rapiddeliveryrider.location

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.rapiddeliveryrider.MainActivity
import com.rapiddeliveryrider.R

/**
 * Foreground location service — keeps GPS updates while the app is minimized / screen locked
 * during active deliveries. One service instance covers all concurrent active orders.
 */
class LocationTrackingService : Service() {

  private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }
  private var callback: LocationCallback? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopTracking()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        return START_NOT_STICKY
      }
      else -> startTracking()
    }
    return START_STICKY
  }

  private fun startTracking() {
    ensureChannel()
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    if (callback != null) return

    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, INTERVAL_MS)
      .setMinUpdateIntervalMillis(FASTEST_MS)
      .setMinUpdateDistanceMeters(10f)
      .build()

    val cb = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        val loc = result.lastLocation ?: return
        LocationTrackingModule.emitLocation(
          loc.latitude,
          loc.longitude,
          loc.accuracy,
          loc.time,
        )
      }
    }
    callback = cb
    try {
      fused.requestLocationUpdates(request, cb, Looper.getMainLooper())
    } catch (_: SecurityException) {
      stopSelf()
    }
  }

  private fun stopTracking() {
    callback?.let {
      try {
        fused.removeLocationUpdates(it)
      } catch (_: Exception) {
      }
    }
    callback = null
  }

  override fun onDestroy() {
    stopTracking()
    super.onDestroy()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Delivery tracking",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Shows while Maison Rider shares your location during active deliveries"
      setShowBadge(false)
    }
    getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val launch = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Delivery tracking active")
      .setContentText("Sharing your location with Maison operations")
      .setSmallIcon(R.mipmap.ic_launcher)
      .setOngoing(true)
      .setContentIntent(launch)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }

  companion object {
    const val ACTION_START = "com.rapiddeliveryrider.location.START"
    const val ACTION_STOP = "com.rapiddeliveryrider.location.STOP"
    private const val CHANNEL_ID = "maison_location_tracking"
    private const val NOTIFICATION_ID = 42801
    private const val INTERVAL_MS = 8_000L
    private const val FASTEST_MS = 5_000L
  }
}
