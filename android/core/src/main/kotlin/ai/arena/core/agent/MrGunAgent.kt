package ai.arena.core.agent

import ai.arena.core.control.AimController
import ai.arena.core.vision.Frame
import ai.arena.core.vision.MrGunDetector
import ai.arena.core.vision.MrGunObservation
import kotlin.math.abs

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
    private var stableKind = ""
    private var stableX = Double.NaN
    private var stableY = Double.NaN
    private var stableFrames = 0

    override fun onFrame(frame: Frame, tNanos: Long): Output {
        // Không áp cooldown ở khung đầu: quyết định bắn đầu tiên không được chậm hơn lượt quét đầu tiên
        if (firstT < 0) { firstT = tNanos; lastTapT = tNanos - 10_000_000_000L }
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

        // Nút cần tap (chơi lại / NO THANKS) phải đứng yên ≥ 6 khung liên tiếp (lệch ≤ 4 px) mới tin
        val targetKind = if (!obs.restartX.isNaN()) "restart" else if (!obs.declineX.isNaN()) "decline" else ""
        val targetX = if (targetKind == "restart") obs.restartX else obs.declineX
        val targetY = if (targetKind == "restart") obs.restartY else obs.declineY
        if (targetKind.isNotEmpty() && targetKind == stableKind && abs(targetX - stableX) <= 4 && abs(targetY - stableY) <= 4) stableFrames++
        else { stableFrames = if (targetKind.isEmpty()) 0 else 1; stableKind = targetKind; stableX = targetX; stableY = targetY }

        if (!tap && !obs.transition) {
            val sinceLine = if (lastLineT < 0) (tNanos - firstT) / 1e9 else (tNanos - lastLineT) / 1e9
            if (sinceLine > 1.0 && sinceTap > 1.5) {
                if (stableFrames >= 6) {
                    // Màn thua: tap đúng vào nút chơi lại; menu hồi sinh: tap NO THANKS
                    tap = true; reason = targetKind; restarts++
                    tapX = targetX / width; tapY = targetY / height
                } else if (obs.startScreen) {
                    // Màn bắt đầu level: "TAP TO START" — tap giữa màn, tránh hàng nút ở dưới
                    tap = true; reason = "start"; restarts++
                    tapX = 0.5; tapY = 0.5
                }
            }
        }

        if (tap) { lastTapT = tNanos; if (reason.startsWith("fire")) shots++ }
        val status = "%.0f fps · %s · bắn %d · chơi lại %d · %s%s".format(
            fps, if (obs.transition) "chuyển cảnh" else detector.debug, shots, restarts, if (tap) "TAP:" else "", reason)
        return Output(obs, tap, reason, status, d.detail, tapX, tapY)
    }

    override fun reset() {
        detector.reset(); controller.reset(); lastT = -1; lastTapT = -1; firstT = -1; lastLineT = -1; shots = 0; restarts = 0
        stableKind = ""; stableX = Double.NaN; stableY = Double.NaN; stableFrames = 0
    }
}
