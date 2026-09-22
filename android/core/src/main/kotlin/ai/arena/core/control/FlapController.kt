package ai.arena.core.control

import ai.arena.core.vision.Bird
import ai.arena.core.vision.Observation
import ai.arena.core.vision.Pipe
import kotlin.math.abs
import kotlin.math.max

/**
 * Bộ điều khiển dự đoán (receding horizon) cho Flappy Bird.
 *
 * Mỗi khung hình mô phỏng ba quỹ đạo bằng vật lý đã đo, có bù độ trễ tap:
 *  B — vỗ ngay bây giờ (hiệu lực sau L giây),
 *  C — chờ thêm một nhịp rồi mới vỗ,
 *  N — không vỗ trong nhịp tới.
 * Phải vỗ khi C hoặc N đâm ống dưới/đất (chờ thêm là quá muộn). Nếu không bắt buộc, vỗ khi chim
 * ở dưới mục tiêu (hơi thấp hơn tâm khe) và B không làm chim đâm ống trên/trần.
 */
class FlapController(private val height: Int, private val p: Params = Params()) {

    class Params(
        val stepSec: Double = 1.0 / 120,
        /** Biên an toàn so với mép khe: tỉ lệ chiều cao khe, tối thiểu theo bán kính chim. */
        val marginGapFrac: Double = 0.10,
        val marginRadiusFrac: Double = 0.5,
        /** Biên thêm ở mép TRÊN bằng tỉ lệ này × độ cao cú vỗ — bù sai số mô hình vFlap/g. */
        val riseSafetyFrac: Double = 0.15,
        val defaultTargetFrac: Double = 0.5,
        val minTapIntervalSec: Double = 0.10,
        val ceilingFrac: Double = 0.02,
    )

    class Decision(val tap: Boolean, val reason: String, val target: Double, val detail: String = "")

    private enum class Kind { NONE, LOWER, UPPER }
    private class Violation(val kind: Kind, val t: Double) {
        override fun toString() = if (kind == Kind.NONE) "ok" else "$kind@%.2f".format(t)
    }

    fun decide(
        obs: Observation,
        bird: Bird,
        physics: PhysicsEstimator,
        scrollPxPerSec: Double,
        sinceLastTapSec: Double,
        /** Chu kỳ khung hình (giây) — là "cơ hội vỗ kế tiếp" khi cân nhắc có thể chờ thêm hay không. */
        frameDtSec: Double = 1.0 / 60,
    ): Decision {
        val g = physics.gravity
        val vf = physics.flapVelocity
        // Độ trễ đã đo tính từ lúc phát lệnh tap tới lúc thấy hiệu lực — đã gồm cả thời lượng cử chỉ
        val latency = physics.latencySec
        val r = bird.radius
        // Độ cao một cú vỗ (từ lúc có hiệu lực tới đỉnh). Chim dao động trong [mục tiêu − rise, mục tiêu],
        // nên đặt mục tiêu = tâm khe + rise/2 để dải dao động nằm giữa khe.
        val rise = vf * vf / (2 * g)
        // Mục tiêu bám theo ống SẮP VÀO; ống đang ở trong chỉ đóng vai trò ràng buộc trên/dưới (must/can).
        // Nếu bám mục tiêu của ống đang ở trong, chim sẽ vỗ vô ích giữa khe rộng rồi không kịp rơi xuống
        // khe kế tiếp nằm thấp hơn nhiều.
        val upcoming = obs.pipes.firstOrNull { it.left - r > bird.x }
        val current = obs.pipes.firstOrNull { bird.x >= it.left - r && bird.x <= it.right + r }
        val relevant = upcoming ?: current
        val target = relevant?.let { pipe ->
            val m = max(p.marginGapFrac * pipe.gapHeight, p.marginRadiusFrac * r)
            (pipe.gapCenter + rise / 2).coerceIn(pipe.gapTop + m + r, pipe.gapBottom - m - r)
        } ?: (p.defaultTargetFrac * obs.groundY)

        if (sinceLastTapSec < p.minTapIntervalSec) return Decision(false, "cooldown", target)

        // Cooldown đã qua nên cơ hội vỗ kế tiếp là ngay khung sau — không phải sau một cooldown nữa.
        // Lấy Δ = cooldown sẽ làm "must" nổ sớm tới 0.1 s → vỗ từ quá cao rồi đâm ống trên.
        val delta = frameDtSec.coerceIn(1.0 / 240, 0.05)
        val apex = abs(vf) / g
        val riseSafety = p.riseSafetyFrac * rise
        val b = simulate(obs, bird, g, vf, scrollPxPerSec, riseSafety, flapAt = latency, until = latency + apex + 0.12)
        val c = simulate(obs, bird, g, vf, scrollPxPerSec, riseSafety, flapAt = latency + delta, until = latency + delta + apex + 0.12)
        val n = simulate(obs, bird, g, vf, scrollPxPerSec, 0.0, flapAt = null, until = latency + delta + 0.03)

        val yAtEffect = bird.y + bird.vy * latency + 0.5 * g * latency * latency
        val detail = "B=$b C=$c N=$n L=%.0fms yEff=%.0f tgt=%.0f r=%.1f scroll=%.0f".format(latency * 1000, yAtEffect, target, r, scrollPxPerSec)

        val mustFlap = c.kind == Kind.LOWER || n.kind == Kind.LOWER
        if (mustFlap) return Decision(true, "must", target, detail)

        val wantFlap = yAtEffect > target
        val canFlap = b.kind != Kind.UPPER
        return if (wantFlap && canFlap) Decision(true, "target", target, detail)
        else Decision(false, if (wantFlap) "blocked-up" else "hold", target, detail)
    }

    /** Giới hạn trên/dưới cho chim tại thời điểm t (ống trôi sang trái theo tốc độ cuộn). */
    private fun bounds(obs: Observation, x: Double, r: Double, scroll: Double, t: Double, upperExtra: Double, out: DoubleArray) {
        var upper = p.ceilingFrac * height + upperExtra
        var lower = obs.groundY.toDouble()
        for (pipe in obs.pipes) {
            val left = pipe.left - scroll * t
            val right = pipe.right - scroll * t
            if (x >= left - r && x <= right + r) {
                val m = max(p.marginGapFrac * pipe.gapHeight, p.marginRadiusFrac * r)
                upper = max(upper, pipe.gapTop + m + upperExtra)
                lower = kotlin.math.min(lower, pipe.gapBottom - m)
            }
        }
        out[0] = upper; out[1] = lower
    }

    private fun simulate(
        obs: Observation, bird: Bird, g: Double, vf: Double, scroll: Double, upperExtra: Double,
        flapAt: Double?, until: Double,
    ): Violation {
        var y = bird.y
        var v = bird.vy
        var t = 0.0
        var flapped = false
        val r = bird.radius
        val bb = DoubleArray(2)
        val dt = p.stepSec
        while (t < until) {
            if (flapAt != null && !flapped && t >= flapAt) { v = vf; flapped = true }
            v += g * dt
            y += v * dt
            t += dt
            bounds(obs, bird.x, r, scroll, t, upperExtra, bb)
            if (y + r > bb[1]) return Violation(Kind.LOWER, t)
            if (y - r < bb[0]) return Violation(Kind.UPPER, t)
        }
        return Violation(Kind.NONE, Double.POSITIVE_INFINITY)
    }

    @Suppress("unused")
    private fun Pipe.describe() = "$left..$right gap $gapTop..$gapBottom"
}
