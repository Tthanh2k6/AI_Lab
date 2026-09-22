package ai.arena.android

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.util.Log
import android.view.accessibility.AccessibilityEvent

/**
 * Dịch vụ Trợ năng chỉ làm một việc: thực hiện cú tap tại toạ độ màn hình bằng dispatchGesture.
 * Không cần root, không đọc nội dung màn hình. Người dùng bật thủ công trong Cài đặt → Trợ năng.
 */
class TapAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "TapAccessibility"

        @Volatile
        var instance: TapAccessibilityService? = null
            private set

        /** Thống kê cử chỉ để hiển thị / chẩn đoán. */
        @Volatile var dispatched: Long = 0
        @Volatile var completed: Long = 0
        @Volatile var cancelled: Long = 0
        @Volatile var rejected: Long = 0
    }

    private val gestureCallback = object : GestureResultCallback() {
        override fun onCompleted(gestureDescription: GestureDescription?) { completed++ }
        override fun onCancelled(gestureDescription: GestureDescription?) {
            cancelled++
            Log.w(TAG, "gesture cancelled (total $cancelled)")
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i(TAG, "connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

    override fun onInterrupt() = Unit

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        Log.w(TAG, "unbound by system")
        instance = null
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        Log.w(TAG, "destroyed")
        instance = null
        super.onDestroy()
    }

    /** Tap tại (x, y) px màn hình, nhấn giữ `durationMs`. Trả về true nếu hệ thống nhận cử chỉ. */
    fun tap(x: Float, y: Float, durationMs: Long = 30L): Boolean {
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0L, durationMs)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        val ok = dispatchGesture(gesture, gestureCallback, null)
        if (ok) dispatched++ else { rejected++; Log.w(TAG, "dispatchGesture rejected (total $rejected)") }
        return ok
    }
}
