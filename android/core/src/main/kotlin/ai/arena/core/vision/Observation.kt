package ai.arena.core.vision

/** Một cặp ống (trên + dưới) và khe trống giữa chúng, toạ độ theo khung hình đã thu nhỏ. */
class Pipe(val left: Int, val right: Int, val gapTop: Int, val gapBottom: Int) {
    val width: Int get() = right - left
    val gapHeight: Int get() = gapBottom - gapTop
    val gapCenter: Double get() = (gapTop + gapBottom) / 2.0
    override fun toString() = "Pipe(x=$left..$right, gap=$gapTop..$gapBottom)"
}

/**
 * Con chim. `y` là vị trí đã lọc, `rawY` là toạ độ đo trực tiếp ở khung này (NaN khi đang dự đoán),
 * `vy` là vận tốc dọc (px/giây, dương = rơi xuống) tính từ hai phép đo gần nhất nên phản ứng ngay
 * sau cú vỗ. `coasting` = khung này không nhìn thấy chim, vị trí là dự đoán từ vật lý.
 */
class Bird(val x: Double, val y: Double, val rawY: Double, val radius: Double, val vy: Double, val coasting: Boolean) {
    override fun toString() = "Bird(x=%.1f, y=%.1f, r=%.1f, vy=%.0f%s)".format(x, y, radius, vy, if (coasting) ", coast" else "")
}

/** Kết quả nhận diện của một khung hình. */
class Observation(
    val frameIndex: Long,
    val tNanos: Long,
    val width: Int,
    val height: Int,
    /** Tốc độ cuộn của màn chơi, px/khung hình (dương = nội dung trôi sang trái). */
    val scrollPxPerFrame: Double,
    val scrollConfidence: Double,
    /** Hàng đầu tiên của dải đất (= height nếu không có đất). */
    val groundY: Int,
    val bird: Bird?,
    /** Các ống đang thấy, sắp theo x tăng dần. */
    val pipes: List<Pipe>,
)
