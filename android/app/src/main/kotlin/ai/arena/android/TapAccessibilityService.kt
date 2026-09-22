package ai.arena.android

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.view.accessibility.AccessibilityEvent

/**
 * Dịch vụ Trợ năng chỉ làm một việc: thực hiện cú tap tại toạ độ màn hình bằng dispatchGesture.
 * Không cần root, không đọc nội dung màn hình. Người dùng bật thủ công trong Cài đặt → Trợ năng.
 */
class TapAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile
        var instance: TapAccessibilityService? = null
            private set
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

    override fun onInterrupt() = Unit

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        instance = null
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    /** Tap tại (x, y) px màn hình, nhấn giữ `durationMs`. Trả về true nếu hệ thống nhận cử chỉ. */
    fun tap(x: Float, y: Float, durationMs: Long = 30L): Boolean {
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0L, durationMs)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        return dispatchGesture(gesture, null, null)
    }
}
