package ai.arena.core.util

/** Trung vị của N mẫu gần nhất (vòng đệm nhỏ, sắp xếp lại khi hỏi — N ≤ vài chục). */
class RunningMedian(private val capacity: Int) {
    private val buf = DoubleArray(capacity)
    private var pos = 0
    var size = 0
        private set

    fun add(v: Double) {
        buf[pos] = v
        pos = (pos + 1) % capacity
        if (size < capacity) size++
    }

    fun median(): Double {
        if (size == 0) return Double.NaN
        val a = buf.copyOf(size)
        a.sort()
        return if (size % 2 == 1) a[size / 2] else 0.5 * (a[size / 2 - 1] + a[size / 2])
    }

    fun clear() { pos = 0; size = 0 }
}

/** Khớp bình phương tối thiểu y = c0 + c1·t + c2·t² (ma trận chuẩn 3×3). Trả về null nếu suy biến. */
object QuadFit {
    class Result(val c0: Double, val c1: Double, val c2: Double)

    fun fit(t: DoubleArray, y: DoubleArray, n: Int): Result? {
        if (n < 4) return null
        var s0 = 0.0; var s1 = 0.0; var s2 = 0.0; var s3 = 0.0; var s4 = 0.0
        var b0 = 0.0; var b1 = 0.0; var b2 = 0.0
        for (i in 0 until n) {
            val ti = t[i]; val t2 = ti * ti
            s0 += 1; s1 += ti; s2 += t2; s3 += t2 * ti; s4 += t2 * t2
            b0 += y[i]; b1 += y[i] * ti; b2 += y[i] * t2
        }
        // Giải [s0 s1 s2; s1 s2 s3; s2 s3 s4] · c = b bằng Cramer
        val det = s0 * (s2 * s4 - s3 * s3) - s1 * (s1 * s4 - s3 * s2) + s2 * (s1 * s3 - s2 * s2)
        if (kotlin.math.abs(det) < 1e-12) return null
        val d0 = b0 * (s2 * s4 - s3 * s3) - s1 * (b1 * s4 - s3 * b2) + s2 * (b1 * s3 - s2 * b2)
        val d1 = s0 * (b1 * s4 - s3 * b2) - b0 * (s1 * s4 - s3 * s2) + s2 * (s1 * b2 - b1 * s2)
        val d2 = s0 * (s2 * b2 - b1 * s3) - s1 * (s1 * b2 - b1 * s2) + b0 * (s1 * s3 - s2 * s2)
        return Result(d0 / det, d1 / det, d2 / det)
    }
}
