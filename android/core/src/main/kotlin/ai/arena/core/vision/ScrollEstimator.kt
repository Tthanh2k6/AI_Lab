package ai.arena.core.vision

import kotlin.math.abs

/**
 * Ước lượng tốc độ cuộn ngang của màn chơi (px/khung hình) bằng cách khớp gradient ngang của hai
 * khung liên tiếp ở các độ dịch 0..maxShift. Nội dung game trôi SANG TRÁI: cur(x) ≈ prev(x + d).
 *
 * Dùng gradient thay vì độ sáng thô để vùng trời một màu không "khớp" với mọi độ dịch.
 * `colMask` (tuỳ chọn) giới hạn phép khớp vào một số cột — ví dụ quanh biên ống — để nền parallax
 * (mây, thành phố trôi chậm hơn) không kéo lệch kết quả.
 */
class ScrollEstimator(private val maxShift: Int, private val rowStep: Int = 2) {

    class Result(val shift: Double, val confidence: Double)

    fun estimate(prev: Frame, cur: Frame, yStart: Int, yEnd: Int, colMask: BooleanArray? = null): Result {
        val w = cur.width
        val gc = cur.gradX
        val gp = prev.gradX
        val costs = DoubleArray(maxShift + 1)
        for (d in 0..maxShift) {
            var sum = 0L
            var n = 0
            var y = yStart
            while (y < yEnd) {
                val row = y * w
                val xEnd = w - 1 - d
                var x = 1
                while (x < xEnd) {
                    if (colMask == null || colMask[x]) {
                        sum += abs(gc[row + x] - gp[row + x + d])
                        n++
                    }
                    x++
                }
                y += rowStep
            }
            costs[d] = if (n > 0) sum.toDouble() / n else 0.0
        }

        var best = 0
        for (d in 1..maxShift) if (costs[d] < costs[best]) best = d
        val mean = costs.average()
        val confidence = if (mean > 1e-6) ((mean - costs[best]) / mean).coerceIn(0.0, 1.0) else 0.0

        // Nội suy parabol quanh cực tiểu để có độ dịch dưới điểm ảnh
        var shift = best.toDouble()
        if (best in 1 until maxShift) {
            val c0 = costs[best - 1]; val c1 = costs[best]; val c2 = costs[best + 1]
            val denom = c0 - 2 * c1 + c2
            if (denom > 1e-9) shift = best + 0.5 * (c0 - c2) / denom
        }
        return Result(shift, confidence)
    }
}
