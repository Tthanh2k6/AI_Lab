package ai.arena.android

import ai.arena.core.agent.GameAgent
import ai.arena.core.agent.GameKind
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
 * tác nhân của game đã chọn ([GameKind]) và tap qua [TapAccessibilityService] khi tác nhân yêu cầu.
 *
 * Android 14+: phải startForeground với kiểu mediaProjection TRƯỚC khi lấy MediaProjection,
 * và mỗi lần người dùng cấp quyền chỉ dùng được một lần.
 *
 * Khung hình được lấy theo hai đường: listener của ImageReader và một bộ canh (watchdog) 500 ms
 * tự kéo ảnh nếu listener im lặng — hàng đợi ảnh có thể đầy trước khi listener kịp gắn, khi đó
 * listener sẽ không bao giờ được gọi nữa.
 */
class AgentService : Service() {

    companion object {
        const val ACTION_START = "ai.arena.android.action.START"
        const val ACTION_STOP = "ai.arena.android.action.STOP"
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_RESULT_DATA = "resultData"
        const val EXTRA_GAME = "game"
        private const val CHANNEL_ID = "agent"
        private const val NOTIF_ID = 1
        private const val TAG = "AgentService"

        /** Bề rộng khung đưa vào tác nhân (px). Chiều cao theo tỉ lệ màn hình. */
        private const val TARGET_WIDTH = 216
        private const val WATCHDOG_MS = 500L
        private const val NO_FRAME_WARN_MS = 3000L
        private const val LOG_EVERY_FRAMES = 120L
    }

    private lateinit var thread: HandlerThread
    private lateinit var handler: Handler
    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var agent: GameAgent? = null
    private var game: GameKind = GameKind.FLAPPY
    private var captureW = 0
    private var captureH = 0
    private var screenW = 0
    private var screenH = 0
    private var lastNotifUpdate = 0L
    private var startMs = 0L
    private var lastFrameMs = 0L
    private var lastLogMs = 0L
    private var lastLogFrames = 0L
    private var warnedNoFrames = false
    private var procMsEma = 0.0

    private val watchdog = object : Runnable {
        override fun run() {
            val r = reader ?: return
            val now = SystemClock.elapsedRealtime()
            // Listener im lặng > 300 ms → tự kéo ảnh (nếu có) để thông hàng đợi
            if (now - lastFrameMs > 300) onImage(r)
            if (AgentStatus.frames == 0L && now - startMs > NO_FRAME_WARN_MS && !warnedNoFrames) {
                warnedNoFrames = true
                val msg = "Chưa nhận được khung hình nào sau ${NO_FRAME_WARN_MS / 1000} s. " +
                    "Hãy Dừng, bắt đầu lại và chọn 'Toàn bộ màn hình' trong hộp thoại chụp màn hình."
                Log.w(TAG, msg)
                AgentStatus.lastError = msg
                notify(msg)
            }
            handler.postDelayed(this, WATCHDOG_MS)
        }
    }

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
                game = GameKind.fromId(intent.getStringExtra(EXTRA_GAME))
                startForeground(NOTIF_ID, buildNotification("Đang khởi động ${game.label}…"), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
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
            override fun onStop() {
                Log.w(TAG, "projection stopped by system/user")
                AgentStatus.lastError = "Hệ thống đã dừng chụp màn hình"
                stopCapture(); stopSelf()
            }
            override fun onCapturedContentVisibilityChanged(isVisible: Boolean) {
                Log.i(TAG, "captured content visible=$isVisible")
                AgentStatus.contentVisible = isVisible
            }
            override fun onCapturedContentResize(width: Int, height: Int) {
                Log.i(TAG, "captured content resized to ${width}x$height")
            }
        }, handler)

        val wm = getSystemService(WindowManager::class.java)
        val bounds = wm.currentWindowMetrics.bounds
        screenW = bounds.width(); screenH = bounds.height()
        val dpi = resources.displayMetrics.densityDpi
        val factor = ceil(screenW / TARGET_WIDTH.toDouble()).toInt().coerceAtLeast(1)
        captureW = (screenW / factor) and 1.inv()
        captureH = (screenH / factor) and 1.inv()

        agent = game.createAgent(captureW, captureH)
        AgentStatus.running = true
        AgentStatus.game = game.label
        AgentStatus.frames = 0; AgentStatus.taps = 0; AgentStatus.lastError = ""; AgentStatus.contentVisible = true
        AgentStatus.text = "${game.label}: đang chụp ${captureW}×${captureH} (màn ${screenW}×${screenH})"
        startMs = SystemClock.elapsedRealtime(); lastFrameMs = startMs; lastLogMs = startMs; lastLogFrames = 0
        warnedNoFrames = false

        val r = ImageReader.newInstance(captureW, captureH, PixelFormat.RGBA_8888, 3)
        reader = r
        // Gắn listener TRƯỚC khi tạo màn hình ảo để không bỏ lỡ / kẹt các khung đầu tiên
        r.setOnImageAvailableListener({ onImage(it) }, handler)
        display = mp.createVirtualDisplay(
            "ai-arena-agent", captureW, captureH, dpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.surface, null, handler,
        )
        handler.postDelayed(watchdog, WATCHDOG_MS)
        Log.i(TAG, "capture started ${captureW}x$captureH from ${screenW}x$screenH game=${game.id}")
    }

    private fun onImage(reader: ImageReader) {
        val img = try { reader.acquireLatestImage() } catch (e: Exception) { Log.e(TAG, "acquireLatestImage", e); null } ?: return
        val rgb: IntArray
        try {
            val plane = img.planes[0]
            val buf = plane.buffer
            val rowStride = plane.rowStride
            val pixelStride = plane.pixelStride
            val w = captureW; val h = captureH
            // Bộ đệm MỚI cho mỗi khung: bộ nhận diện giữ tham chiếu tới khung trước để so sánh chuyển động,
            // dùng chung một mảng sẽ làm khung trước luôn giống khung sau (không thấy gì chuyển động).
            rgb = IntArray(w * h)
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
        (ag as? ai.arena.core.agent.MrGunAgent)?.controller?.latencySec = AgentStatus.mrGunLatencyMs / 1000.0
        val t = SystemClock.elapsedRealtimeNanos()
        val out = ag.onFrame(Frame(captureW, captureH, rgb), t)
        val procMs = (SystemClock.elapsedRealtimeNanos() - t) / 1e6
        procMsEma = if (procMsEma == 0.0) procMs else 0.9 * procMsEma + 0.1 * procMs
        val now = SystemClock.elapsedRealtime()
        lastFrameMs = now
        AgentStatus.frames++
        if (AgentStatus.frames == 1L) Log.i(TAG, "first frame after ${now - startMs} ms")
        if (out.tap) {
            val svc = TapAccessibilityService.instance
            if (svc == null) {
                AgentStatus.lastError = "Dịch vụ Trợ năng chưa kết nối — không tap được (tắt rồi bật lại trong Cài đặt)"
                Log.w(TAG, "tap requested but accessibility service not connected")
            } else {
                // Vị trí tap: tác nhân chỉ định (vd. nút chơi lại) hoặc mặc định của game
                val fx = if (out.tapXFrac.isNaN()) game.tapXFrac else out.tapXFrac
                val fy = if (out.tapYFrac.isNaN()) game.tapYFrac else out.tapYFrac
                if (!out.tapXFrac.isNaN()) Log.i(TAG, "tap ${out.reason} at (%.2f, %.2f)".format(fx, fy))
                if (svc.tap((screenW * fx).toFloat(), (screenH * fy).toFloat())) AgentStatus.taps++
            }
        }
        AgentStatus.text = out.status
        if (now - lastLogMs >= 2000 || AgentStatus.frames - lastLogFrames >= LOG_EVERY_FRAMES) {
            val fps = (AgentStatus.frames - lastLogFrames) * 1000.0 / (now - lastLogMs).coerceAtLeast(1)
            Log.i(TAG, "f=${AgentStatus.frames} fps=%.1f proc=%.1fms taps=${AgentStatus.taps} g=${TapAccessibilityService.completed}/${TapAccessibilityService.cancelled} | ${out.status}".format(fps, procMsEma))
            lastLogMs = now; lastLogFrames = AgentStatus.frames
        }
        if (now - lastNotifUpdate > 1000) {
            lastNotifUpdate = now
            notify(out.status)
        }
    }

    private fun notify(text: String) {
        getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildNotification(text))
    }

    private fun stopCapture() {
        AgentStatus.running = false
        handler.removeCallbacks(watchdog)
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
            .setContentTitle("${getString(R.string.app_name)} · ${game.label}")
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
