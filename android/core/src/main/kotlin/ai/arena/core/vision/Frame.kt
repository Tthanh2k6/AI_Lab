package ai.arena.core.vision

import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Một khung hình RGB đã thu nhỏ (0xRRGGBB mỗi điểm, xếp theo hàng).
 * Mọi thuật toán thị giác trong core làm việc trên lớp này và không phụ thuộc Android.
 */
class Frame(val width: Int, val height: Int, val rgb: IntArray) {
    init {
        require(rgb.size == width * height) { "rgb size ${rgb.size} != ${width}x$height" }
    }

    /** Độ sáng 0..255 (Rec.601), tính một lần lúc tạo khung. */
    val luma: IntArray = IntArray(width * height).also { out ->
        for (i in rgb.indices) {
            val c = rgb[i]
            out[i] = (77 * ((c ushr 16) and 0xFF) + 150 * ((c ushr 8) and 0xFF) + 29 * (c and 0xFF)) ushr 8
        }
    }

    /** |Y(x+1) − Y(x−1)| — gradient ngang, dùng cho ước lượng cuộn và tìm biên dọc. Cột ngoài cùng = 0. */
    val gradX: IntArray by lazy {
        val g = IntArray(width * height)
        for (y in 0 until height) {
            val row = y * width
            for (x in 1 until width - 1) g[row + x] = abs(luma[row + x + 1] - luma[row + x - 1])
        }
        g
    }

    fun idx(x: Int, y: Int): Int = y * width + x
    fun rgbAt(x: Int, y: Int): Int = rgb[y * width + x]
    fun lumaAt(x: Int, y: Int): Int = luma[y * width + x]

    companion object {
        fun r(c: Int) = (c ushr 16) and 0xFF
        fun g(c: Int) = (c ushr 8) and 0xFF
        fun b(c: Int) = c and 0xFF
        fun pack(r: Int, g: Int, b: Int) = (r.coerceIn(0, 255) shl 16) or (g.coerceIn(0, 255) shl 8) or b.coerceIn(0, 255)

        /** Khoảng cách màu L1 trên 3 kênh (0..765). */
        fun colorDistance(a: Int, b: Int): Int = abs(r(a) - r(b)) + abs(g(a) - g(b)) + abs(b(a) - b(b))

        /** Trộn màu: (1−t)·a + t·b. */
        fun blend(a: Int, b: Int, t: Double): Int = pack(
            (r(a) * (1 - t) + r(b) * t).roundToInt(),
            (g(a) * (1 - t) + g(b) * t).roundToInt(),
            (b(a) * (1 - t) + b(b) * t).roundToInt(),
        )

        /** Lượng tử hoá còn `bits` bit/kênh (để gom màu gần nhau vào một ngăn). */
        fun quantize(c: Int, bits: Int): Int {
            val shift = 8 - bits
            return ((r(c) ushr shift) shl (2 * bits)) or ((g(c) ushr shift) shl bits) or (b(c) ushr shift)
        }

        /** Màu đại diện (tâm ngăn) của một mã lượng tử. */
        fun dequantize(q: Int, bits: Int): Int {
            val shift = 8 - bits
            val mask = (1 shl bits) - 1
            val half = (1 shl shift) / 2
            return pack(((q ushr (2 * bits)) and mask shl shift) + half, ((q ushr bits) and mask shl shift) + half, (q and mask shl shift) + half)
        }

        /** Thu nhỏ theo hệ số nguyên bằng trung bình khối (box filter). */
        fun downscale(width: Int, height: Int, rgb: IntArray, factor: Int): Frame {
            require(factor >= 1)
            if (factor == 1) return Frame(width, height, rgb.copyOf())
            val w = width / factor
            val h = height / factor
            val out = IntArray(w * h)
            val n = factor * factor
            for (y in 0 until h) {
                for (x in 0 until w) {
                    var rs = 0; var gs = 0; var bs = 0
                    for (dy in 0 until factor) {
                        var i = (y * factor + dy) * width + x * factor
                        for (dx in 0 until factor) {
                            val c = rgb[i++]
                            rs += r(c); gs += g(c); bs += b(c)
                        }
                    }
                    out[y * w + x] = pack(rs / n, gs / n, bs / n)
                }
            }
            return Frame(w, h, out)
        }
    }
}
