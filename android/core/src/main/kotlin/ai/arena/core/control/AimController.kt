package ai.arena.core.control

import ai.arena.core.vision.MrGunDetector
import ai.arena.core.vision.MrGunObservation
import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Quyết định bấm bắn cho Mr Gun: dự đoán góc vạch ngắm tại thời điểm cú tap có hiệu lực
 * (θ + ω·L, phản xạ ở biên lắc nếu đã biết) rồi so với dải góc mà viên đạn trúng đầu / trúng thân.
 * Nhắm đầu nếu dải góc của đầu rộng hơn sai số thời gian; nếu không, nhắm giữa thân (an toàn hơn).
 * Chỉ tap ở khung mà sai số dự đoán nhỏ nhất (trong nửa bước góc của một khung).
 */
class AimController(private val p: Params = Params()) {

    class Params(
        /** Độ trễ từ lúc phát lệnh tap đến lúc game bắn (giây) — chưa tự đo, dùng giá trị mặc định. */
        val latencySec: Double = 0.08,
        /** Rung của độ trễ (giây) → sai số góc = ω × jitter. */
        val jitterSec: Double = 0.012,
        val minAngularVelDegPerSec: Double = 8.0,
        val extraMarginDeg: Double = 0.6,
        val cooldownSec: Double = 0.45,
    )

    class Decision(val tap: Boolean, val reason: String, val detail: String)

    fun decide(obs: MrGunObservation, sinceLastTapSec: Double, frameDtSec: Double): Decision {
        if (obs.transition) return Decision(false, "transition", "")
        val e = obs.enemy ?: return Decision(false, "no-enemy", "")
        if (!obs.pivotValid || obs.angleDeg.isNaN()) return Decision(false, "no-line", "")
        val w = obs.angularVelDegPerSec
        if (w.isNaN() || abs(w) < p.minAngularVelDegPerSec) return Decision(false, "line-still", "w=%.0f".format(w))
        if (sinceLastTapSec < p.cooldownSec) return Decision(false, "cooldown", "")

        val px = obs.pivotX; val py = obs.pivotY
        // Dải góc trúng thân: góc tới 4 góc khung bao (địch ở phía trên nên không vắt qua ±180°)
        val corners = doubleArrayOf(
            MrGunDetector.angleTo(px, py, e.minX.toDouble(), e.minY.toDouble()),
            MrGunDetector.angleTo(px, py, e.maxX.toDouble(), e.minY.toDouble()),
            MrGunDetector.angleTo(px, py, e.minX.toDouble(), e.maxY.toDouble()),
            MrGunDetector.angleTo(px, py, e.maxX.toDouble(), e.maxY.toDouble()),
        )
        val bodyLo = corners.min(); val bodyHi = corners.max()
        val bodyMid = (bodyLo + bodyHi) / 2
        val bodyHalf = (bodyHi - bodyLo) / 2
        // Dải góc trúng đầu
        val headAng = MrGunDetector.angleTo(px, py, e.headX, e.headY)
        val headDist = sqrt((e.headX - px) * (e.headX - px) + (e.headY - py) * (e.headY - py))
        val headHalf = Math.toDegrees(atan(e.headR / max(1.0, headDist)))

        val sigma = abs(w) * (p.jitterSec + frameDtSec / 2) + p.extraMarginDeg
        val aimHead = headHalf >= sigma + 0.3
        val target = if (aimHead) headAng else bodyMid
        val tol = if (aimHead) headHalf - sigma * 0.5 else max(0.5, bodyHalf - sigma)

        var predicted = obs.angleDeg + w * p.latencySec
        if (!obs.sweepMaxDeg.isNaN() && predicted > obs.sweepMaxDeg) predicted = 2 * obs.sweepMaxDeg - predicted
        if (!obs.sweepMinDeg.isNaN() && predicted < obs.sweepMinDeg) predicted = 2 * obs.sweepMinDeg - predicted
        val err = MrGunDetector.wrapDeg(predicted - target)
        val halfStep = abs(w) * frameDtSec / 2
        val detail = "θ=%.1f w=%.0f pred=%.1f tgt=%.1f(%s) tol=%.1f err=%.1f step/2=%.1f".format(
            obs.angleDeg, w, predicted, target, if (aimHead) "head" else "body", tol, err, halfStep)
        // Mục tiêu ngoài biên lắc → đợi (phản xạ đã xử lý phần lớn; đây là trường hợp không bao giờ tới)
        val beyondMax = !obs.sweepMaxDeg.isNaN() && target > obs.sweepMaxDeg + 1
        val beyondMin = !obs.sweepMinDeg.isNaN() && target < obs.sweepMinDeg - 1
        if ((beyondMax || beyondMin) && !aimHead) return Decision(false, "unreachable", detail)
        val hit = abs(err) <= tol && abs(err) <= halfStep + 0.25
        return Decision(hit, if (hit) (if (aimHead) "fire-head" else "fire-body") else "wait", detail)
    }

    @Suppress("unused")
    private fun clamp(v: Double, lo: Double, hi: Double) = min(hi, max(lo, v))
}
