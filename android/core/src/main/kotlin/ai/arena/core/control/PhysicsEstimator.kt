package ai.arena.core.control

import ai.arena.core.util.QuadFit
import ai.arena.core.util.RunningMedian
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Tự đo vật lý của bản Flappy đang chơi từ quỹ đạo chim quan sát được:
 *  • trọng lực g (px/s²)  — khớp parabol trên các cửa sổ KHÔNG có cú vỗ,
 *  • vận tốc sau khi vỗ vFlap (px/s, âm = đi lên) — từ bước nhảy vận tốc sau mỗi lần tap,
 *  • độ trễ tap → hiệu lực (giây).
 * Có giá trị mặc định (giữa dải các bản clone phổ biến) để điều khiển được ngay khi chưa đo.
 */
class PhysicsEstimator(frameHeight: Int) {
    private val h = frameHeight.toDouble()

    val gravityPrior = 2.4 * h
    val flapPrior = -0.65 * h

    var gravity = gravityPrior; private set
    var flapVelocity = flapPrior; private set
    var latencySec = 0.09; private set

    val gravitySamples get() = gMed.size
    val flapSamples get() = fMed.size

    private val gMed = RunningMedian(15)
    private val fMed = RunningMedian(9)
    private val lMed = RunningMedian(9)

    // Cửa sổ mẫu liên tiếp (t tương đối theo giây, y px) cho khớp parabol
    private val winT = DoubleArray(64)
    private val winY = DoubleArray(64)
    private var winN = 0
    private var winT0 = -1L
    private var tapsInWindow = 0
    private var windowAfterEffect = false

    private var lastT = -1L
    private var lastY = 0.0
    private var lastVy = Double.NaN
    /** Các cú tap chưa thấy hiệu lực (theo thứ tự thời gian). */
    private val pendingTaps = ArrayDeque<Long>()
    private var lastEffectT = -1L

    /** Độ trễ tối đa hợp lý giữa tap và hiệu lực; tap cũ hơn coi như đã lỡ/không có hiệu lực. */
    private val maxLatencySec = 0.35

    fun onTap(tNanos: Long) {
        pendingTaps.addLast(tNanos)
        tapsInWindow++
    }

    /** Không thấy chim ở khung này → ngắt chuỗi mẫu. */
    fun onMiss() {
        lastT = -1; lastVy = Double.NaN; winN = 0; winT0 = -1
    }

    fun onBird(tNanos: Long, y: Double) {
        if (lastT < 0) { startWindow(tNanos, y, afterEffect = false); lastT = tNanos; lastY = y; lastVy = Double.NaN; return }
        val dt = (tNanos - lastT) / 1e9
        if (dt <= 0.003 || dt > 0.12) { onMiss(); onBird(tNanos, y); return }
        val vy = (y - lastY) / dt

        // Hiệu lực của cú tap: vận tốc nhảy vọt lên (âm). Gán cho cú tap CŨ NHẤT còn trong hạn độ trễ;
        // tap quá hạn (không thấy hiệu lực, vd. tap lúc chưa vào ván) bị bỏ.
        while (pendingTaps.isNotEmpty() && (tNanos - pendingTaps.first()) / 1e9 > maxLatencySec) pendingTaps.removeFirst()
        if (pendingTaps.isNotEmpty() && !lastVy.isNaN() && vy - lastVy < -0.12 * h && vy < 0) {
            val since = (tNanos - pendingTaps.first()) / 1e9
            pendingTaps.clear()
            lMed.add((since - dt / 2).coerceAtLeast(0.005))
            latencySec = lMed.median().coerceIn(0.01, 0.4)
            fMed.add(vy)
            flapVelocity = min(-0.15 * h, fMed.median())
            lastEffectT = tNanos
            // cửa sổ mới bắt đầu ngay sau cú vỗ (chuỗi rơi tự do mới)
            startWindow(tNanos, y, afterEffect = true)
            lastT = tNanos; lastY = y; lastVy = vy
            return
        }

        if (winT0 < 0) startWindow(tNanos, y, afterEffect = false)
        if (winN < winT.size) { winT[winN] = (tNanos - winT0) / 1e9; winY[winN] = y; winN++ }
        val span = winT[winN - 1]
        // Cửa sổ ≥ 0.3 s: đủ dài để dao động sprite đập cánh (~5–10 Hz) không bị khớp nhầm thành độ cong
        if (winN >= 14 && span >= 0.30) {
            // Cửa sổ có tap xen vào (hiệu lực có thể chưa được phát hiện) → không dùng để đo trọng lực.
            // Trước cú vỗ đầu tiên ván chưa bắt đầu (chim nhấp nhô ở màn "sẵn sàng") → cũng bỏ qua.
            if (tapsInWindow == 0 && lastEffectT >= 0) {
                val fit = QuadFit.fit(winT, winY, winN)
                if (fit != null && residual(fit) <= 1.5) {
                    val g = 2 * fit.c2
                    // loại cửa sổ chạm vận tốc giới hạn (g≈0) hoặc nhiễu quá lớn
                    if (g > 0.25 * h && g < 12 * h) { gMed.add(g); gravity = gMed.median() }
                    // vận tốc đầu cửa sổ ngay sau cú vỗ = vFlap chính xác hơn sai phân 2 khung
                    if (windowAfterEffect && fit.c1 < -0.1 * h) { fMed.add(fit.c1); flapVelocity = min(-0.15 * h, fMed.median()) }
                }
            }
            startWindow(tNanos, y, afterEffect = false)
        }

        lastT = tNanos; lastY = y; lastVy = vy
    }

    private fun residual(fit: QuadFit.Result): Double {
        var s = 0.0
        for (i in 0 until winN) {
            val t = winT[i]
            val e = winY[i] - (fit.c0 + fit.c1 * t + fit.c2 * t * t)
            s += e * e
        }
        return sqrt(s / winN)
    }

    private fun startWindow(tNanos: Long, y: Double, afterEffect: Boolean) {
        winT0 = tNanos; winN = 1; winT[0] = 0.0; winY[0] = y
        tapsInWindow = 0
        windowAfterEffect = afterEffect
    }

    fun reset() {
        gravity = gravityPrior; flapVelocity = flapPrior; latencySec = 0.09
        gMed.clear(); fMed.clear(); lMed.clear()
        onMiss(); pendingTaps.clear(); lastEffectT = -1
    }

    override fun toString() = "g=%.2fH vFlap=%.2fH lat=%.0fms (n=%d/%d)".format(gravity / h, flapVelocity / h, latencySec * 1000, gMed.size, fMed.size)
}
