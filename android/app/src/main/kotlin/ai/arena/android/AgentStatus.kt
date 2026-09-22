package ai.arena.android

/** Trạng thái tác nhân để Activity hiển thị (được cập nhật từ luồng xử lý khung hình). */
object AgentStatus {
    @Volatile var running: Boolean = false
    @Volatile var text: String = ""
    @Volatile var frames: Long = 0
    @Volatile var taps: Long = 0
    @Volatile var lastError: String = ""
}
