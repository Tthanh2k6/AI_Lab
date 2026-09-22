package ai.arena.core.agent

import ai.arena.core.control.FlapController
import ai.arena.core.control.PhysicsEstimator
import ai.arena.core.vision.FlappyDetector
import ai.arena.core.vision.Frame
import ai.arena.core.vision.Observation
import kotlin.math.abs

/**
 * Ghép nhận diện + đo vật lý + điều khiển thành một tác nhân: nhận khung hình, trả về có tap hay không.
 * Không biết gì về Android — phía app chỉ việc đưa khung hình vào và thực hiện cú tap khi được bảo.
 */
class FlappyAgent(val width: Int, val height: Int) : GameAgent {

    override val name = "Flappy Bird"

    val detector = FlappyDetector(width, height)
    val physics = PhysicsEstimator(height)
    val controller = FlapController(height)

    class Output(val observation: Observation, tap: Boolean, reason: String, status: String, detail: String = "") :
        AgentOutput(tap, reason, status, detail)

    var fps = 60.0; private set
    private var lastT = -1L
    private var lastTapT = -1L
    private var lastPipeT = -1L
    private var firstT = -1L
    private var lastReason = ""

    override fun onFrame(frame: Frame, tNanos: Long): Output {
        // Khung đầu tiên: coi như vừa "tap" để các luật tap-khi-rảnh (restart/kickoff) chờ đủ lâu
        // cho bộ nhận diện khoá được chim trước, thay vì tap mù ngay lập tức.
        if (firstT < 0) { firstT = tNanos; lastTapT = tNanos }
        if (lastT > 0) {
            val dt = (tNanos - lastT) / 1e9
            if (dt > 0.001 && dt < 0.5) fps = 0.9 * fps + 0.1 * (1.0 / dt)
        }
        lastT = tNanos

        detector.gravity = physics.gravity
        val obs = detector.process(frame, tNanos)
        val bird = obs.bird
        if (bird != null && !bird.coasting) physics.onBird(tNanos, bird.rawY) else physics.onMiss()

        val sinceTap = (tNanos - lastTapT) / 1e9
        val scrollPxPerSec = obs.scrollPxPerFrame * fps
        var tap = false
        var reason: String
        var detail = ""

        if (bird != null) {
            if (obs.pipes.isNotEmpty()) lastPipeT = tNanos
            val d = controller.decide(obs, bird, physics, scrollPxPerSec, sinceTap, 1.0 / fps)
            tap = d.tap
            reason = d.reason
            detail = d.detail
            // Màn "sẵn sàng": có chim, chưa có ống, chưa tap lâu → tap để bắt đầu ván
            val sincePipe = if (lastPipeT < 0) (tNanos - firstT) / 1e9 else (tNanos - lastPipeT) / 1e9
            if (!tap && obs.pipes.isEmpty() && sinceTap > 1.5 && sincePipe > 2.0) { tap = true; reason = "kickoff" }
        } else {
            // Không thấy chim và màn đứng yên (menu / thua) → tap thưa để bắt đầu lại
            val still = obs.scrollConfidence < 0.2 || abs(obs.scrollPxPerFrame) < 0.3
            reason = if (still) "idle" else "no-bird"
            if (still && sinceTap > 1.2) { tap = true; reason = "restart" }
        }

        if (tap) { lastTapT = tNanos; physics.onTap(tNanos) }
        lastReason = reason
        return Output(obs, tap, reason, describe(obs, tap, reason), detail)
    }

    private fun describe(obs: Observation, tap: Boolean, reason: String): String {
        val b = obs.bird
        return buildString {
            append("%.0f fps · cuộn %.1fpx/f".format(fps, obs.scrollPxPerFrame))
            append(" · đất y=").append(obs.groundY)
            append(" · ống ").append(obs.pipes.size)
            append(" · chim ").append(if (b == null) "?" else "y=%.0f".format(b.y))
            append(" · ").append(physics.toString())
            append(" · ").append(if (tap) "TAP:" else "").append(reason)
        }
    }

    override fun reset() { detector.reset(); physics.reset(); lastT = -1; lastTapT = -1; lastPipeT = -1; firstT = -1 }
}
