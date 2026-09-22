package ai.arena.core.agent

import ai.arena.core.control.AimController
import ai.arena.core.vision.Frame
import ai.arena.core.vision.MrGunDetector
import ai.arena.core.vision.MrGunObservation

/** Tác nhân Mr Gun: nhận diện tâm xoay / vạch ngắm / địch, bắn khi vạch sắp thẳng hàng. */
class MrGunAgent(val width: Int, val height: Int) : GameAgent {

    override val name = "Mr Gun"

    val detector = MrGunDetector(width, height)
    val controller = AimController()

    class Output(val observation: MrGunObservation, tap: Boolean, reason: String, status: String, detail: String = "") :
        AgentOutput(tap, reason, status, detail)

    var fps = 60.0; private set
    private var lastT = -1L
    private var lastTapT = -1L
    private var firstT = -1L
    private var lastLineT = -1L
    private var shots = 0

    override fun onFrame(frame: Frame, tNanos: Long): Output {
        if (firstT < 0) { firstT = tNanos; lastTapT = tNanos }
        if (lastT > 0) {
            val dt = (tNanos - lastT) / 1e9
            if (dt > 0.001 && dt < 0.5) fps = 0.9 * fps + 0.1 * (1.0 / dt)
        }
        lastT = tNanos

        val obs = detector.process(frame, tNanos)
        if (!obs.angleDeg.isNaN()) lastLineT = tNanos
        val sinceTap = (tNanos - lastTapT) / 1e9
        var tap = false
        var reason: String
        var detail = ""

        val d = controller.decide(obs, sinceTap, 1.0 / fps)
        tap = d.tap; reason = d.reason; detail = d.detail

        // Không thấy vạch ngắm lâu (menu / thua / màn chờ) → tap thưa để bắt đầu lại
        if (!tap && !obs.transition) {
            val sinceLine = if (lastLineT < 0) (tNanos - firstT) / 1e9 else (tNanos - lastLineT) / 1e9
            if (sinceLine > 2.0 && sinceTap > 1.5) { tap = true; reason = "restart" }
        }

        if (tap) { lastTapT = tNanos; if (reason.startsWith("fire")) shots++ }
        val status = "%.0f fps · %s · bắn %d · %s%s".format(fps, if (obs.transition) "chuyển cảnh" else detector.debug, shots, if (tap) "TAP:" else "", reason)
        return Output(obs, tap, reason, status, detail)
    }

    override fun reset() { detector.reset(); lastT = -1; lastTapT = -1; firstT = -1; lastLineT = -1; shots = 0 }
}
