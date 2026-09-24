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
        val latencySec: Double = 0.11,
        /** Rung của độ trễ (giây) → sai số góc = ω × jitter. */
        val jitterSec: Double = 0.012,
        /** Dưới tốc độ góc này CHỈ từ chối khi vạch thật sự đứng yên (không nhúc nhích quá stillSec) — vạch chậm lại
         *  ở hai đầu lắc vẫn được bắn. */
        val minAngularVelDegPerSec: Double = 8.0,
        val stillSec: Double = 0.3,
        /** Vận tốc góc đo được vượt mức này là nhiễu (vạch Mr Gun ≤ ~150°/s) → không bắn theo dự đoán đó. */
        val maxAngularVelDegPerSec: Double = 240.0,
        val extraMarginDeg: Double = 0.6,
        val cooldownSec: Double = 0.5,
        /** Địch vừa xuất hiện / vừa dịch chuyển phải đứng yên ít nhất chừng này mới bắn (địch còn nhảy vào vị trí). */
        val enemySettleSec: Double = 0.4,
        val enemyMovePx: Double = 3.0,
    )

    class Decision(val tap: Boolean, val reason: String, val detail: String)

    /** Độ trễ tap→bắn đang dùng (giây); app cho người dùng chỉnh trực tiếp khi đang chạy. */
    @Volatile var latencySec: Double = p.latencySec

    private var lastMoveT = Double.NaN
    private var lastSeenAngle = Double.NaN
    private var enemyHx = Double.NaN
    private var enemyHy = Double.NaN
    private var enemySinceT = Double.NaN
    private var seenMin = Double.NaN
    private var seenMax = Double.NaN

    fun reset() { lastMoveT = Double.NaN; lastSeenAngle = Double.NaN; enemyHx = Double.NaN; enemyHy = Double.NaN; enemySinceT = Double.NaN; seenMin = Double.NaN; seenMax = Double.NaN }

    fun decide(obs: MrGunObservation, sinceLastTapSec: Double, frameDtSec: Double): Decision {
        val t = obs.tNanos / 1e9
        if (obs.transition) { enemyHx = Double.NaN; enemyHy = Double.NaN; seenMin = Double.NaN; seenMax = Double.NaN; return Decision(false, "transition", "") }
        if (!obs.angleDeg.isNaN()) { if (seenMin.isNaN() || obs.angleDeg < seenMin) seenMin = obs.angleDeg; if (seenMax.isNaN() || obs.angleDeg > seenMax) seenMax = obs.angleDeg }
        if (!obs.angleDeg.isNaN()) {
            if (lastSeenAngle.isNaN() || abs(obs.angleDeg - lastSeenAngle) > 0.3 || lastMoveT.isNaN()) lastMoveT = t
            lastSeenAngle = obs.angleDeg
        }
        val e = obs.enemy ?: run { enemyHx = Double.NaN; enemyHy = Double.NaN; return Decision(false, "no-enemy", "") }
        // Địch phải ổn định vị trí: mới xuất hiện hoặc vừa dịch > enemyMovePx → tính lại thời điểm ổn định
        if (enemyHx.isNaN() || abs(e.headX - enemyHx) > p.enemyMovePx || abs(e.headY - enemyHy) > p.enemyMovePx) { enemyHx = e.headX; enemyHy = e.headY; enemySinceT = t }
        if (t - enemySinceT < p.enemySettleSec) return Decision(false, "enemy-settling", "%.2fs".format(t - enemySinceT))
        if (!obs.pivotValid || obs.angleDeg.isNaN()) return Decision(false, "no-line", "")
        val w = obs.angularVelDegPerSec
        if (w.isNaN()) return Decision(false, "line-still", "w=NaN")
        if (abs(w) > p.maxAngularVelDegPerSec) return Decision(false, "line-jump", "w=%.0f".format(w))
        if (abs(w) < p.minAngularVelDegPerSec && t - lastMoveT > p.stillSec) return Decision(false, "line-still", "w=%.0f".format(w))
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
        // Điểm ngắm thân = 35 % từ đỉnh khung (vai/ngực): lệch vì trễ vẫn trúng thân hoặc đầu, không rơi xuống chân
        val bodyAim = MrGunDetector.angleTo(px, py, (e.minX + e.maxX) / 2.0, e.minY + 0.42 * (e.maxY - e.minY))
        val bodyMid = bodyAim
        val bodyHalf = min(bodyAim - bodyLo, bodyHi - bodyAim)
        // Dải góc trúng đầu
        val headAng = MrGunDetector.angleTo(px, py, e.headX, e.headY)
        val headDist = sqrt((e.headX - px) * (e.headX - px) + (e.headY - py) * (e.headY - py))
        val headHalf = Math.toDegrees(atan(e.headR / max(1.0, headDist)))

        val sigma = abs(w) * (p.jitterSec + frameDtSec / 2) + p.extraMarginDeg
        val aimHead = headHalf >= sigma + 0.3
        val target = if (aimHead) headAng else bodyMid
        val tol = if (aimHead) headHalf - sigma * 0.5 else max(0.5, bodyHalf - sigma)

        var predicted = obs.angleDeg + w * latencySec
        if (!obs.sweepMaxDeg.isNaN() && predicted > obs.sweepMaxDeg) predicted = 2 * obs.sweepMaxDeg - predicted
        if (!obs.sweepMinDeg.isNaN() && predicted < obs.sweepMinDeg) predicted = 2 * obs.sweepMinDeg - predicted
        // Biên chưa xác nhận mà dự đoán vượt quá góc từng thấy → không biết vạch có đảo chiều không → đợi
        val err = MrGunDetector.wrapDeg(predicted - target)
        // Bước góc của MỘT khung theo nhịp khung đo được: đang tiến tới mục tiêu mà còn xa hơn một bước thì khung sau
        // sẽ gần hơn → đợi; đã ở trong dải trúng mà không còn tiến tới (vừa qua đỉnh, hoặc đang lùi) thì bắn ngay,
        // không chờ lượt quét sau.
        val step = abs(w) * frameDtSec
        val approaching = err * w < 0
        val detail = "θ=%.1f w=%.0f pred=%.1f tgt=%.1f(%s) tol=%.1f err=%.1f step=%.1f lat=%.0fms".format(
            obs.angleDeg, w, predicted, target, if (aimHead) "head" else "body", tol, err, step, latencySec * 1000)
        // Mục tiêu ngoài biên lắc → đợi (phản xạ đã xử lý phần lớn; đây là trường hợp không bao giờ tới)
        val beyondMax = !obs.sweepMaxDeg.isNaN() && target > obs.sweepMaxDeg + 1
        val beyondMin = !obs.sweepMinDeg.isNaN() && target < obs.sweepMinDeg - 1
        if ((beyondMax || beyondMin) && !aimHead) return Decision(false, "unreachable", detail)
        val hit = abs(err) <= tol && (!approaching || abs(err) <= step + 0.25)
        return Decision(hit, if (hit) (if (aimHead) "fire-head" else "fire-body") else "wait", detail)
    }

    @Suppress("unused")
    private fun clamp(v: Double, lo: Double, hi: Double) = min(hi, max(lo, v))
}
