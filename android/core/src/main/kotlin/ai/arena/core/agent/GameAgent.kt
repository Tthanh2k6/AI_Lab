package ai.arena.core.agent

import ai.arena.core.vision.Frame

/** Kết quả của một khung hình: có tap hay không, vì sao, và dòng trạng thái để hiển thị. */
open class AgentOutput(val tap: Boolean, val reason: String, val status: String, val detail: String = "")

/** Giao diện chung cho mọi tác nhân chơi game từ khung hình màn hình. */
interface GameAgent {
    val name: String
    fun onFrame(frame: Frame, tNanos: Long): AgentOutput
    fun reset()
}

/** Danh sách game hỗ trợ — app dùng để hiển thị và khởi tạo tác nhân tương ứng. */
enum class GameKind(val id: String, val label: String) {
    FLAPPY("flappy", "Flappy Bird"),
    MR_GUN("mrgun", "Mr Gun");

    fun createAgent(width: Int, height: Int): GameAgent = when (this) {
        FLAPPY -> FlappyAgent(width, height)
        MR_GUN -> MrGunAgent(width, height)
    }

    companion object {
        fun fromId(id: String?): GameKind = entries.firstOrNull { it.id == id } ?: FLAPPY
    }
}
