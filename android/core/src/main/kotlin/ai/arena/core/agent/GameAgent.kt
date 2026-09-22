package ai.arena.core.agent

import ai.arena.core.vision.Frame

/**
 * Kết quả của một khung hình: có tap hay không, vì sao, dòng trạng thái để hiển thị, và (tuỳ chọn)
 * vị trí tap theo tỉ lệ màn hình — NaN nghĩa là dùng vị trí mặc định của game ([GameKind.tapXFrac]).
 */
open class AgentOutput(
    val tap: Boolean, val reason: String, val status: String, val detail: String = "",
    val tapXFrac: Double = Double.NaN, val tapYFrac: Double = Double.NaN,
)

/** Giao diện chung cho mọi tác nhân chơi game từ khung hình màn hình. */
interface GameAgent {
    val name: String
    fun onFrame(frame: Frame, tNanos: Long): AgentOutput
    fun reset()
}

/** Danh sách game hỗ trợ — app dùng để hiển thị và khởi tạo tác nhân tương ứng. */
enum class GameKind(val id: String, val label: String, val tapXFrac: Double, val tapYFrac: Double) {
    /** Flappy nhận tap ở bất kỳ đâu; tránh mép có nút. */
    FLAPPY("flappy", "Flappy Bird", 0.5, 0.62),
    /**
     * Mr Gun nhận tap ở bất kỳ đâu khi đang chơi. Chọn thấp giữa màn: trên màn thua đó đúng là nút
     * "chơi lại", còn banner quảng cáo nằm ở giữa màn (≈ 55–66 % chiều cao) — tap vào đó sẽ mở Play Store.
     */
    MR_GUN("mrgun", "Mr Gun", 0.5, 0.78);

    fun createAgent(width: Int, height: Int): GameAgent = when (this) {
        FLAPPY -> FlappyAgent(width, height)
        MR_GUN -> MrGunAgent(width, height)
    }

    companion object {
        fun fromId(id: String?): GameKind = entries.firstOrNull { it.id == id } ?: FLAPPY
    }
}
