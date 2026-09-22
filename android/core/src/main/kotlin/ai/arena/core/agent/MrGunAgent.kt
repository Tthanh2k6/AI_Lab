package ai.arena.core.agent

import ai.arena.core.control.AimController
import ai.arena.core.vision.Frame
import ai.arena.core.vision.MrGunDetector
import ai.arena.core.vision.MrGunObservation

/**
 * Tác nhân Mr Gun: nhận diện tâm xoay / vạch ngắm / địch, bắn khi vạch sắp thẳng hàng.
 * Trên màn thua chỉ tap khi nhận ra nút "chơi lại" và tap đúng vào nó — không tap mù vì dễ trúng quảng cáo.
 */
class MrGunAgent(val width: Int, val height: Int) : GameAgent {

    override val name = "Mr Gun"

    val detector = MrGunDetector(width, height)
    val controller = AimController()

    class Output(
        val observation: MrGunObservation, tap: Boolean, reason: String, status: String, detail: String = "",
        tapXFrac: Double = Double.NaN, tapYFrac: Double = Double.NaN,
    ) : AgentOutput(tap, reason, status, detail, tapXFrac, tapYFrac)

    var fps = 60.0; private set
    private var lastT = -1L
    private var lastTapT = -1L
    private var firstT = -1L
    private var lastLineT = -1L
    private var shots = 0
    private var restarts = 0

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

        val d = controller.decide(obs, sinceTap, 1.0 / fps)
        var tap = d.tap
        var reason = d.reason
        var tapX = Double.NaN
        var tapY = Double.NaN

        // Màn thua: thấy nút "chơi lại", không thấy vạch ngắm ≥ 1 s → tap vào đúng nút
        if (!tap && !obs.transition && !obs.restartX.isNaN()) {
            val sinceLine = if (lastLineT < 0) (tNanos - firstT) / 1e9 else (tNanos - lastLineT) / 1e9
            if (sinceLine > 1.0 && sinceTap > 1.5) {
                tap = true; reason = "restart"; restarts++
                tapX = obs.restartX / width; tapY = obs.restartY / height
            }
        }

        if (tap) { lastTapT = tNanos; if (reason.startsWith("fire")) shots++ }
        val status = "%.0f fps · %s · bắn %d · chơi lại %d · %s%s".format(
            fps, if (obs.transition) "chuyển cảnh" else detector.debug, shots, restarts, if (tap) "TAP:" else "", reason)
        return Output(obs, tap, reason, status, d.detail, tapX, tapY)
    }

    override fun reset() { detector.reset(); lastT = -1; lastTapT = -1; firstT = -1; lastLineT = -1; shots = 0; restarts = 0 }
}
