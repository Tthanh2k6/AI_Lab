package ai.arena.android

/** Trạng thái tác nhân để Activity hiển thị (được cập nhật từ luồng xử lý khung hình). */
object AgentStatus {
    @Volatile var running: Boolean = false
    @Volatile var game: String = ""
    @Volatile var text: String = ""
    @Volatile var frames: Long = 0
    @Volatile var taps: Long = 0
    @Volatile var lastError: String = ""
    /** Nội dung được chụp có đang hiển thị không (MediaProjection báo, Android 14+). */
    @Volatile var contentVisible: Boolean = true
    /** Độ trễ tap→bắn người dùng chỉnh (ms) cho Mr Gun; áp dụng ngay cả khi đang chạy. */
    @Volatile var mrGunLatencyMs: Int = 110
}
