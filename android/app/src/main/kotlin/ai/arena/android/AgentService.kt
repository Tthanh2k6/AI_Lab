package ai.arena.android

import ai.arena.core.agent.FlappyAgent
import ai.arena.core.vision.Frame
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.SystemClock
import android.util.Log
import android.view.WindowManager
import kotlin.math.ceil

/**
 * Dịch vụ nền: chụp màn hình qua MediaProjection ở độ phân giải thấp, đưa từng khung vào
 * [FlappyAgent] và tap qua [TapAccessibilityService] khi tác nhân yêu cầu.
 *
 * Android 14+: phải startForeground với kiểu mediaProjection TRƯỚC khi lấy MediaProjection,
 * và mỗi lần người dùng cấp quyền chỉ dùng được một lần.
 */
class AgentService : Service() {

    companion object {
        const val ACTION_START = "ai.arena.android.action.START"
        const val ACTION_STOP = "ai.arena.android.action.STOP"
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_RESULT_DATA = "resultData"
        private const val CHANNEL_ID = "agent"
        private const val NOTIF_ID = 1
        private const val TAG = "AgentService"

        /** Bề rộng khung đưa vào tác nhân (px). Chiều cao theo tỉ lệ màn hình. */
        private const val TARGET_WIDTH = 216
        /** Vị trí tap theo tỉ lệ màn hình — Flappy nhận tap ở bất kỳ đâu, tránh mép có nút. */
        private const val TAP_X_FRAC = 0.5f
        private const val TAP_Y_FRAC = 0.62f
    }

    private lateinit var thread: HandlerThread
    private lateinit var handler: Handler
    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var agent: FlappyAgent? = null
    private var rgb: IntArray = IntArray(0)
    private var captureW = 0
    private var captureH = 0
    private var screenW = 0
    private var screenH = 0
    private var lastNotifUpdate = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        thread = HandlerThread("agent-capture").also { it.start() }
        handler = Handler(thread.looper)
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, getString(R.string.notif_channel), NotificationManager.IMPORTANCE_LOW))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val code = intent.getIntExtra(EXTRA_RESULT_CODE, Int.MIN_VALUE)
                val data: Intent? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
                else @Suppress("DEPRECATION") intent.getParcelableExtra(EXTRA_RESULT_DATA)
                if (code == Int.MIN_VALUE || data == null) { stopSelf(); return START_NOT_STICKY }
                startForeground(NOTIF_ID, buildNotification("Đang khởi động…"), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
                try {
                    startCapture(code, data)
                } catch (e: Exception) {
                    Log.e(TAG, "startCapture failed", e)
                    AgentStatus.lastError = e.toString()
                    stopCapture(); stopSelf()
                }
            }
            ACTION_STOP -> { stopCapture(); stopSelf() }
        }
        return START_NOT_STICKY
    }

    private fun startCapture(code: Int, data: Intent) {
        val mpm = getSystemService(MediaProjectionManager::class.java)
        val mp = mpm.getMediaProjection(code, data) ?: error("MediaProjection null")
        projection = mp
        mp.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() { stopCapture(); stopSelf() }
        }, handler)

        val wm = getSystemService(WindowManager::class.java)
        val bounds = wm.currentWindowMetrics.bounds
        screenW = bounds.width(); screenH = bounds.height()
        val dpi = resources.displayMetrics.densityDpi
        val factor = ceil(screenW / TARGET_WIDTH.toDouble()).toInt().coerceAtLeast(1)
        captureW = (screenW / factor) and 1.inv()
        captureH = (screenH / factor) and 1.inv()
        rgb = IntArray(captureW * captureH)

        val r = ImageReader.newInstance(captureW, captureH, PixelFormat.RGBA_8888, 3)
        reader = r
        display = mp.createVirtualDisplay(
            "ai-arena-agent", captureW, captureH, dpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.surface, null, handler,
        )
        agent = FlappyAgent(captureW, captureH)
        AgentStatus.running = true
        AgentStatus.frames = 0; AgentStatus.taps = 0; AgentStatus.lastError = ""
        AgentStatus.text = "Đang chụp ${captureW}×${captureH} (màn ${screenW}×${screenH})"
        r.setOnImageAvailableListener({ onImage(it) }, handler)
        Log.i(TAG, "capture started ${captureW}x$captureH from ${screenW}x$screenH")
    }

    private fun onImage(reader: ImageReader) {
        val img = reader.acquireLatestImage() ?: return
        try {
            val plane = img.planes[0]
            val buf = plane.buffer
            val rowStride = plane.rowStride
            val pixelStride = plane.pixelStride
            val w = captureW; val h = captureH
            for (y in 0 until h) {
                var i = y * rowStride
                val row = y * w
                for (x in 0 until w) {
                    val rr = buf.get(i).toInt() and 0xFF
                    val gg = buf.get(i + 1).toInt() and 0xFF
                    val bb = buf.get(i + 2).toInt() and 0xFF
                    rgb[row + x] = (rr shl 16) or (gg shl 8) or bb
                    i += pixelStride
                }
            }
        } finally {
            img.close()
        }
        val ag = agent ?: return
        val t = SystemClock.elapsedRealtimeNanos()
        val out = ag.onFrame(Frame(captureW, captureH, rgb), t)
        AgentStatus.frames++
        if (out.tap) {
            val svc = TapAccessibilityService.instance
            if (svc == null) {
                AgentStatus.lastError = "Chưa bật dịch vụ Trợ năng — không tap được"
            } else if (svc.tap(screenW * TAP_X_FRAC, screenH * TAP_Y_FRAC)) {
                AgentStatus.taps++
            }
        }
        AgentStatus.text = out.status
        val now = SystemClock.elapsedRealtime()
        if (now - lastNotifUpdate > 1000) {
            lastNotifUpdate = now
            getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildNotification(out.status))
        }
    }

    private fun stopCapture() {
        AgentStatus.running = false
        reader?.setOnImageAvailableListener(null, null)
        display?.release(); display = null
        reader?.close(); reader = null
        projection?.stop(); projection = null
        agent = null
    }

    private fun buildNotification(text: String): Notification {
        val stopIntent = PendingIntent.getService(
            this, 0, Intent(this, AgentService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val openIntent = PendingIntent.getActivity(
            this, 1, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setContentIntent(openIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .addAction(Notification.Action.Builder(null, getString(R.string.btn_stop), stopIntent).build())
            .build()
    }

    override fun onDestroy() {
        stopCapture()
        thread.quitSafely()
        super.onDestroy()
    }
}
