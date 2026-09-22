package ai.arena.core.vision

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/** Địch: khung bao + tâm đầu (25 % hàng trên cùng của khối) + bán kính đầu ước lượng. */
class Enemy(
    val minX: Int, val maxX: Int, val minY: Int, val maxY: Int,
    val headX: Double, val headY: Double, val headR: Double,
) {
    val centerX: Double get() = (minX + maxX) / 2.0
    val centerY: Double get() = (minY + maxY) / 2.0
    override fun toString() = "Enemy(x=$minX..$maxX y=$minY..$maxY head=(%.0f,%.0f) r=%.1f)".format(headX, headY, headR)
}

/**
 * Kết quả nhận diện Mr Gun ở một khung. Góc theo độ: 0° = sang phải, tăng ngược chiều kim đồng hồ
 * (90° = thẳng lên) — trục y màn hình hướng xuống đã được lật khi tính.
 */
class MrGunObservation(
    val frameIndex: Long,
    val tNanos: Long,
    val pivotX: Double, val pivotY: Double, val pivotValid: Boolean,
    /** Góc vạch ngắm hiện tại (NaN nếu không thấy vạch). */
    val angleDeg: Double,
    /** Vận tốc góc (độ/giây, NaN nếu chưa đủ dữ liệu). */
    val angularVelDegPerSec: Double,
    /** Biên lắc đã quan sát được (NaN nếu chưa thấy đảo chiều). */
    val sweepMinDeg: Double, val sweepMaxDeg: Double,
    val enemy: Enemy?,
    /** Cả màn đang chuyển động (leo cầu thang / chuyển cảnh) — không nên bắn. */
    val transition: Boolean,
    val motionFrac: Double,
)

/**
 * Bộ nhận diện Mr Gun dùng chung cho các bản/skin — dựa vào cấu trúc:
 *  • Nền = các màu chiếm diện tích lớn (trời, bậc thang); mọi thứ khác là tiền cảnh.
 *  • Vạch ngắm là thứ duy nhất CHUYỂN ĐỘNG khi hai nhân vật đứng yên → khớp đường thẳng qua các điểm
 *    tiền cảnh đang chuyển động; TÂM XOAY = giao điểm bình phương tối thiểu của các vạch ở nhiều khung.
 *  • Có tâm xoay rồi thì góc vạch mỗi khung = góc có nhiều điểm tiền cảnh nhất khi quét tia quanh tâm
 *    (chịu được vạch đứt đoạn, và cả lúc vạch đứng yên).
 *  • Địch = khối tiền cảnh TĨNH, đặc, dáng đứng, ở phía trên tâm xoay; đầu = 25 % hàng trên cùng.
 */
class MrGunDetector(val width: Int, val height: Int, private val p: Params = Params()) {

    class Params(
        val colorBits: Int = 4,
        /** Màu chiếm ≥ tỉ lệ này diện tích khung được coi là nền. */
        val dominantFrac: Double = 0.035,
        val bgTolerance: Int = 54,
        val motionThreshold: Int = 60,
        /** Tỉ lệ điểm chuyển động vượt mức này → cả cảnh đang chuyển (leo thang). */
        val transitionMotionFrac: Double = 0.025,
        val hudTopFrac: Double = 0.10,
        val lineMinPixels: Int = 14,
        val lineMinElongation: Double = 12.0,
        val pivotHistory: Int = 12,
        val pivotMinSpreadDeg: Double = 8.0,
        val pivotMaxResidual: Double = 4.0,
        val scanInnerFrac: Double = 0.03,
        val scanOuterFrac: Double = 0.55,
        val scanMinFill: Double = 0.18,
        val blobMinCount: Int = 20,
        val blobMinDensity: Double = 0.22,
        val angleHistory: Int = 6,
        /** Góc nhảy quá mức này giữa 2 khung → gián đoạn (lượt mới không bắt được chuyển cảnh), không phải đảo chiều. */
        val maxStepDeg: Double = 20.0,
        /** Góc quan sát vượt biên đã học quá mức này → biên sai, bỏ xác nhận. */
        val sweepPushTolDeg: Double = 1.5,
    )

    private var prev: Frame? = null
    private var frameIndex = 0L
    private var lastT = -1L

    // Bảng màu nền (màu trung bình của các ngăn lượng tử chiếm diện tích lớn)
    private val binCount = IntArray(1 shl (3 * 4))
    private val binR = LongArray(1 shl (3 * 4))
    private val binG = LongArray(1 shl (3 * 4))
    private val binB = LongArray(1 shl (3 * 4))
    private var palette = IntArray(0)

    private val fg = BooleanArray(width * height)
    private val mv = BooleanArray(width * height)
    private val blocked = BooleanArray(width * height)
    /** Vùng vạch ngắm ước lượng từ góc khung trước — gốc vạch gần tâm xoay hầu như không dịch nên phải che riêng. */
    private val lineMask = BooleanArray(width * height)
    private var lastAngle = Double.NaN
    private val labels = IntArray(width * height)
    private val stack = IntArray(width * height)

    // Khớp vạch (điểm + hướng) của các khung gần nhất → tâm xoay
    private class LineFit(val mx: Double, val my: Double, val dx: Double, val dy: Double)
    private val fits = ArrayDeque<LineFit>()
    private var pivotX = Double.NaN
    private var pivotY = Double.NaN
    private var pivotValid = false
    private var pivotResidual = Double.NaN

    // Lịch sử góc → vận tốc góc + biên lắc. Biên lắc là thuộc tính của game nên giữ xuyên suốt các
    // lượt, tách theo phía (địch bên phải: góc < 90°, bên trái: góc > 90°).
    private val angT = DoubleArray(16)
    private val angV = DoubleArray(16)
    private var angN = 0
    private var lastDir = 0
    /**
     * Một biên lắc. Chỉ "xác nhận" khi thấy đảo chiều thật; nếu góc quan sát vượt qua biên thì biên bị
     * đẩy theo và mất xác nhận (bằng chứng trực tiếp là biên cũ sai). Bộ điều khiển chỉ dùng biên đã xác nhận.
     */
    private class Bound {
        var value = Double.NaN
        var confirmed = false
        val exposed: Double get() = if (confirmed) value else Double.NaN
        fun reset() { value = Double.NaN; confirmed = false }
        fun confirm(ext: Double) {
            value = if (value.isNaN() || !confirmed || abs(ext - value) > 6.0) ext else 0.5 * value + 0.5 * ext
            confirmed = true
        }
        fun push(a: Double, tol: Double, isMax: Boolean) {
            if (value.isNaN() || (if (isMax) a > value + tol else a < value - tol)) { value = a; confirmed = false }
        }
    }
    private val sweepMinR = Bound(); private val sweepMaxR = Bound()
    private val sweepMinL = Bound(); private val sweepMaxL = Bound()
    private fun boundMin(angle: Double) = if (angle.isNaN() || angle < 90) sweepMinR else sweepMinL
    private fun boundMax(angle: Double) = if (angle.isNaN() || angle < 90) sweepMaxR else sweepMaxL
    private val sweepMin: Double get() = boundMin(lastAngle).exposed
    private val sweepMax: Double get() = boundMax(lastAngle).exposed

    private var enemy: Enemy? = null
    private var enemyMissed = 0

    var debug: String = ""; private set

    private class Blob(var minX: Int, var maxX: Int, var minY: Int, var maxY: Int, var count: Int) {
        val w get() = maxX - minX + 1
        val h get() = maxY - minY + 1
    }

    fun reset() {
        prev = null; frameIndex = 0; lastT = -1
        palette = IntArray(0)
        resetEngagement()
        sweepMinR.reset(); sweepMaxR.reset(); sweepMinL.reset(); sweepMaxL.reset()
        pivotValid = false; pivotX = Double.NaN; pivotY = Double.NaN
        lastAngle = Double.NaN
        fits.clear()
    }

    private fun resetEngagement() {
        angN = 0; lastDir = 0
        enemy = null; enemyMissed = 0
    }

    fun process(frame: Frame, tNanos: Long): MrGunObservation {
        require(frame.width == width && frame.height == height)
        val t = tNanos / 1e9
        lastT = tNanos
        val prevFrame = prev
        val rgb = frame.rgb
        val n = width * height

        if (frameIndex % 15 == 0L || palette.isEmpty()) computePalette(frame)

        // Tiền cảnh + chuyển động
        var moving = 0
        val prgb = prevFrame?.rgb
        for (i in 0 until n) {
            fg[i] = !isBackground(rgb[i])
            val m = prgb != null && Frame.colorDistance(rgb[i], prgb[i]) > p.motionThreshold
            mv[i] = m
            if (m) moving++
        }
        val motionFrac = moving.toDouble() / n
        val transition = motionFrac > p.transitionMotionFrac
        prev = frame
        frameIndex++

        if (transition) {
            resetEngagement()
            fits.clear()
            lastAngle = Double.NaN
            debug = "transition motion=%.3f".format(motionFrac)
            return MrGunObservation(frameIndex - 1, tNanos, pivotX, pivotY, pivotValid, Double.NaN, Double.NaN, sweepMin, sweepMax, null, true, motionFrac)
        }

        // Che vạch ngắm (vị trí khung trước ±2°) để phần gốc gần tâm không bị coi là khối tĩnh
        buildLineMask()

        // Khối tĩnh (nhân vật, địch, HUD)
        val blobs = staticBlobs()
        // Chặn vùng các khối tĩnh để quét tia không bị nhân vật/địch làm nhiễu
        blocked.fill(false)
        for (b in blobs) for (y in max(0, b.minY - 1)..min(height - 1, b.maxY + 1)) for (x in max(0, b.minX - 1)..min(width - 1, b.maxX + 1)) blocked[y * width + x] = true

        // Khớp vạch từ các điểm tiền cảnh đang chuyển động → cập nhật tâm xoay
        val fit = fitMovingLine()
        if (fit != null) {
            fits.addLast(fit)
            while (fits.size > p.pivotHistory) fits.removeFirst()
            solvePivot()
        }

        // Góc vạch: quét tia quanh tâm xoay (ưu tiên), không có tâm thì lấy hướng khớp
        var angle = Double.NaN
        if (pivotValid) angle = scanAngle(frame)
        if (angle.isNaN() && fit != null && pivotValid) {
            val sgn = if ((fit.mx - pivotX) * fit.dx + (fit.my - pivotY) * fit.dy >= 0) 1.0 else -1.0
            angle = Math.toDegrees(atan2(-(fit.dy * sgn), fit.dx * sgn))
        }
        val omega = updateAngle(t, angle)
        lastAngle = angle

        // Địch
        updateEnemy(blobs)

        debug = "pivot=(%.0f,%.0f%s res=%.1f fits=%d) angle=%.1f w=%.0f sweep=[%.0f,%.0f] blobs=%d enemy=%s motion=%.3f".format(
            pivotX, pivotY, if (pivotValid) "" else "?", pivotResidual, fits.size, angle, omega, sweepMin, sweepMax, blobs.size, enemy, motionFrac)
        return MrGunObservation(frameIndex - 1, tNanos, pivotX, pivotY, pivotValid, angle, omega, sweepMin, sweepMax, enemy, false, motionFrac)
    }

    // ── Nền ─────────────────────────────────────────────────────────────────

    private fun computePalette(frame: Frame) {
        binCount.fill(0); binR.fill(0); binG.fill(0); binB.fill(0)
        val rgb = frame.rgb
        var samples = 0
        var i = 0
        while (i < rgb.size) {
            val c = rgb[i]
            val q = Frame.quantize(c, p.colorBits)
            binCount[q]++
            binR[q] += Frame.r(c).toLong(); binG[q] += Frame.g(c).toLong(); binB[q] += Frame.b(c).toLong()
            samples++
            i += 2
        }
        val minCount = (p.dominantFrac * samples).roundToInt()
        val out = ArrayList<Int>()
        for (q in binCount.indices) {
            val cnt = binCount[q]
            if (cnt >= minCount) out.add(Frame.pack((binR[q] / cnt).toInt(), (binG[q] / cnt).toInt(), (binB[q] / cnt).toInt()))
        }
        palette = out.toIntArray()
    }

    private fun isBackground(c: Int): Boolean {
        for (bgc in palette) if (Frame.colorDistance(c, bgc) <= p.bgTolerance) return true
        return false
    }

    // ── Vạch ngắm ───────────────────────────────────────────────────────────

    private fun buildLineMask() {
        lineMask.fill(false)
        if (!pivotValid || lastAngle.isNaN()) return
        val r1 = (p.scanOuterFrac * height).roundToInt() + 4
        for (da in -2..2) {
            val a = Math.toRadians(lastAngle + da)
            val cx = cos(a); val sy = -sin(a)
            var r = 0
            while (r <= r1) {
                val x = (pivotX + r * cx).roundToInt(); val y = (pivotY + r * sy).roundToInt()
                for (dy in -1..1) for (dx in -1..1) {
                    val xx = x + dx; val yy = y + dy
                    if (xx in 0 until width && yy in 0 until height) lineMask[yy * width + xx] = true
                }
                r++
            }
        }
    }

    /** Khớp đường thẳng (PCA) qua các điểm tiền cảnh đang chuyển động, có loại điểm ngoại lai. */
    private fun fitMovingLine(): LineFit? {
        val hud = (p.hudTopFrac * height).toInt()
        var cnt = 0; var sx = 0.0; var sy = 0.0; var sxx = 0.0; var syy = 0.0; var sxy = 0.0
        for (y in hud until height) {
            val row = y * width
            for (x in 0 until width) {
                val i = row + x
                if (fg[i] && mv[i] && !blocked[i]) { cnt++; sx += x; sy += y; sxx += x.toDouble() * x; syy += y.toDouble() * y; sxy += x.toDouble() * y }
            }
        }
        if (cnt < p.lineMinPixels) return null
        var fit = pca(cnt, sx, sy, sxx, syy, sxy) ?: return null
        // Khớp lại chỉ với điểm cách đường ≤ 2 px (loại nhiễu từ hoạt ảnh nhân vật)
        cnt = 0; sx = 0.0; sy = 0.0; sxx = 0.0; syy = 0.0; sxy = 0.0
        var total = 0
        for (y in hud until height) {
            val row = y * width
            for (x in 0 until width) {
                val i = row + x
                if (!(fg[i] && mv[i] && !blocked[i])) continue
                total++
                val d = abs((x - fit.mx) * fit.dy - (y - fit.my) * fit.dx)
                if (d <= 2.0) { cnt++; sx += x; sy += y; sxx += x.toDouble() * x; syy += y.toDouble() * y; sxy += x.toDouble() * y }
            }
        }
        if (cnt < p.lineMinPixels || cnt < 0.6 * total) return null
        fit = pca(cnt, sx, sy, sxx, syy, sxy) ?: return null
        return fit
    }

    private fun pca(n: Int, sx: Double, sy: Double, sxx: Double, syy: Double, sxy: Double): LineFit? {
        val mx = sx / n; val my = sy / n
        val cxx = sxx / n - mx * mx; val cyy = syy / n - my * my; val cxy = sxy / n - mx * my
        val tr = cxx + cyy
        val det = cxx * cyy - cxy * cxy
        val disc = sqrt(max(0.0, tr * tr / 4 - det))
        val l1 = tr / 2 + disc; val l2 = tr / 2 - disc
        if (l1 < 1e-6 || l1 / max(l2, 0.25) < p.lineMinElongation) return null
        val ang = 0.5 * atan2(2 * cxy, cxx - cyy)
        return LineFit(mx, my, cos(ang), sin(ang))
    }

    /** Tâm xoay = điểm gần mọi vạch nhất (bình phương tối thiểu); cần các vạch đủ khác góc. */
    private fun solvePivot() {
        if (fits.size < 4) return
        var minA = Double.MAX_VALUE; var maxA = -Double.MAX_VALUE
        for (f in fits) {
            var a = Math.toDegrees(atan2(f.dy, f.dx)); if (a < 0) a += 180.0 // hướng không phân biệt chiều
            minA = min(minA, a); maxA = max(maxA, a)
        }
        if (maxA - minA < p.pivotMinSpreadDeg) return
        var a11 = 0.0; var a12 = 0.0; var a22 = 0.0; var b1 = 0.0; var b2 = 0.0
        for (f in fits) {
            // (I − d dᵀ)
            val m11 = 1 - f.dx * f.dx; val m12 = -f.dx * f.dy; val m22 = 1 - f.dy * f.dy
            a11 += m11; a12 += m12; a22 += m22
            b1 += m11 * f.mx + m12 * f.my
            b2 += m12 * f.mx + m22 * f.my
        }
        val det = a11 * a22 - a12 * a12
        if (abs(det) < 1e-9) return
        val x = (b1 * a22 - b2 * a12) / det
        val y = (a11 * b2 - a12 * b1) / det
        var res = 0.0
        for (f in fits) { val d = (x - f.mx) * f.dy - (y - f.my) * f.dx; res += d * d }
        res = sqrt(res / fits.size)
        if (x < 0 || x >= width || y < 0 || y >= height) return
        if (res > p.pivotMaxResidual) { if (!pivotValid) pivotResidual = res; return }
        pivotResidual = res
        if (pivotValid && abs(x - pivotX) + abs(y - pivotY) < 0.15 * height) { pivotX = 0.7 * pivotX + 0.3 * x; pivotY = 0.7 * pivotY + 0.3 * y }
        else { pivotX = x; pivotY = y; resetEngagement() }
        pivotValid = true
    }

    /** Quét tia quanh tâm xoay: góc có nhiều điểm tiền cảnh (không thuộc khối tĩnh) nhất. */
    private fun scanAngle(frame: Frame): Double {
        val r0 = max(4, (p.scanInnerFrac * height).roundToInt())
        val r1 = (p.scanOuterFrac * height).roundToInt()
        val hud = (p.hudTopFrac * height).toInt()
        val bins = 241 // −30° … 210°
        val counts = IntArray(bins)
        val reach = IntArray(bins)
        for (b in 0 until bins) {
            val a = Math.toRadians(-30.0 + b)
            val cx = cos(a); val sy = -sin(a)
            var c = 0; var rr = 0
            var r = r0
            while (r <= r1) {
                val x = (pivotX + r * cx).roundToInt(); val y = (pivotY + r * sy).roundToInt()
                if (x < 0 || x >= width || y < hud || y >= height) break
                rr++
                val i = y * width + x
                if (fg[i] && !blocked[i]) c++
                r++
            }
            counts[b] = c; reach[b] = rr
        }
        var best = -1; var bestC = 0
        for (b in 0 until bins) if (counts[b] > bestC) { bestC = counts[b]; best = b }
        if (best < 0 || reach[best] == 0 || bestC < p.scanMinFill * reach[best] || bestC < p.lineMinPixels) return Double.NaN
        var angle = -30.0 + best
        if (best in 1 until bins - 1) {
            val c0 = counts[best - 1].toDouble(); val c1 = counts[best].toDouble(); val c2 = counts[best + 1].toDouble()
            val denom = c0 - 2 * c1 + c2
            if (denom < -1e-9) angle += 0.5 * (c0 - c2) / denom
        }
        return angle
    }

    /** Cập nhật lịch sử góc; trả về vận tốc góc (độ/s) hoặc NaN. Phát hiện đảo chiều để học biên lắc. */
    private fun updateAngle(t: Double, angle: Double): Double {
        if (angle.isNaN()) { if (angN > 0 && t - angT[angN - 1] > 0.25) angN = 0; return Double.NaN }
        if (angN > 0 && abs(angle - angV[angN - 1]) > p.maxStepDeg) {
            // Nhảy góc lớn: lượt mới bắt đầu mà không bắt được chuyển cảnh → làm mới lịch sử, không coi là đảo chiều
            angN = 0; lastDir = 0
        }
        if (angN > 0) {
            val d = angle - angV[angN - 1]
            val dir = if (d > 0.3) 1 else if (d < -0.3) -1 else 0
            if (dir != 0 && lastDir != 0 && dir != lastDir) {
                // đảo chiều: điểm trước là cực trị → xác nhận biên của phía tương ứng
                val ext = angV[angN - 1]
                if (lastDir > 0) boundMax(ext).confirm(ext) else boundMin(ext).confirm(ext)
                // giữ lại 2 điểm cuối để tính vận tốc mới
                angT[0] = angT[angN - 1]; angV[0] = angV[angN - 1]; angN = 1
            }
            if (dir != 0) lastDir = dir
        }
        // Góc vượt biên đã học → biên sai: đẩy theo và bỏ xác nhận
        boundMax(angle).push(angle, p.sweepPushTolDeg, isMax = true)
        boundMin(angle).push(angle, p.sweepPushTolDeg, isMax = false)
        if (angN == angT.size) { System.arraycopy(angT, 1, angT, 0, angN - 1); System.arraycopy(angV, 1, angV, 0, angN - 1); angN-- }
        angT[angN] = t; angV[angN] = angle; angN++
        val k = min(angN, p.angleHistory)
        if (k < 3) return Double.NaN
        // hồi quy tuyến tính trên k điểm cuối
        var st = 0.0; var sv = 0.0; var stt = 0.0; var stv = 0.0
        for (i in angN - k until angN) { st += angT[i]; sv += angV[i]; stt += angT[i] * angT[i]; stv += angT[i] * angV[i] }
        val den = k * stt - st * st
        if (abs(den) < 1e-12) return Double.NaN
        return (k * stv - st * sv) / den
    }

    // ── Khối tĩnh + địch ────────────────────────────────────────────────────

    /**
     * Điểm thuộc nét MẢNH (dày ≤ 3 px theo ngang hoặc dọc): vạch mép bậc thang, chữ số HUD, vạch ngắm.
     * Loại chúng khỏi khối tĩnh ngay ở mức điểm ảnh, vì vạch bậc chạm chân nhân vật sẽ dính liền
     * thành một thành phần liên thông dài — không tách được bằng lọc khối.
     */
    private fun isThin(i: Int): Boolean {
        val x = i % width; val y = i / width
        val hThin = x >= 2 && x + 2 < width && !fg[i - 2] && !fg[i + 2]
        val vThin = y >= 2 && y + 2 < height && !fg[i - 2 * width] && !fg[i + 2 * width]
        return hThin || vThin
    }

    private fun staticOk(i: Int): Boolean = fg[i] && !mv[i] && !lineMask[i] && !isThin(i)

    private fun staticBlobs(): List<Blob> {
        val hud = (p.hudTopFrac * height).toInt()
        labels.fill(0)
        val out = ArrayList<Blob>()
        var next = 1
        for (start in hud * width until width * height) {
            if (labels[start] != 0 || !staticOk(start)) continue
            if (out.size >= 48) break
            var sp = 0
            stack[sp++] = start; labels[start] = next
            val b = Blob(width, -1, height, -1, 0)
            while (sp > 0) {
                val i = stack[--sp]
                val x = i % width; val y = i / width
                b.count++
                if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x
                if (y < b.minY) b.minY = y; if (y > b.maxY) b.maxY = y
                for (dy in -1..1) {
                    val ny = y + dy
                    if (ny < hud || ny >= height) continue
                    for (dx in -1..1) {
                        val nx = x + dx
                        if (nx < 0 || nx >= width) continue
                        val j = ny * width + nx
                        if (labels[j] == 0 && staticOk(j)) { labels[j] = next; stack[sp++] = j }
                    }
                }
            }
            if (b.count >= 6) out.add(b)
            next++
        }
        // Mảnh vụn còn sót của các nét mảnh → bỏ trước khi gộp
        out.removeAll { b -> b.count.toDouble() / (b.w * b.h) < 0.15 }
        // Gộp các khối kề nhau (nhân vật bị vạch ngắm hoặc khoảng hở cắt đôi)
        var merged = true
        while (merged) {
            merged = false
            outer@ for (i in out.indices) for (j in i + 1 until out.size) {
                val a = out[i]; val b = out[j]
                if (a.minX <= b.maxX + 3 && b.minX <= a.maxX + 3 && a.minY <= b.maxY + 3 && b.minY <= a.maxY + 3) {
                    a.minX = min(a.minX, b.minX); a.maxX = max(a.maxX, b.maxX)
                    a.minY = min(a.minY, b.minY); a.maxY = max(a.maxY, b.maxY); a.count += b.count
                    out.removeAt(j); merged = true; break@outer
                }
            }
        }
        return out.filter { it.count >= p.blobMinCount }
    }

    private fun updateEnemy(blobs: List<Blob>) {
        if (!pivotValid) { enemy = null; return }
        // Nhân vật = khối gần tâm xoay nhất
        val player = blobs.minByOrNull { distToBox(pivotX, pivotY, it) }
        val playerArea = player?.let { it.w * it.h }?.toDouble() ?: (0.12 * height * 0.06 * height)
        val playerDist = player?.let { distToBox(pivotX, pivotY, it) } ?: Double.MAX_VALUE
        val cands = blobs.filter { b ->
            if (b === player && playerDist < 0.08 * height) return@filter false
            val density = b.count.toDouble() / (b.w * b.h)
            val aspect = b.h.toDouble() / b.w
            val area = (b.w * b.h).toDouble()
            density >= p.blobMinDensity && aspect in 1.1..4.5 && area >= 0.3 * playerArea && area <= 3.0 * playerArea &&
                b.maxY < pivotY + 0.05 * height && b.h >= 0.04 * height && b.h <= 0.25 * height
        }
        val pick = cands.minByOrNull { distToBox(pivotX, pivotY, it) }
        if (pick == null) {
            enemyMissed++
            if (enemyMissed > 4) enemy = null
            return
        }
        enemyMissed = 0
        // Đầu = 25 % hàng trên cùng: trọng tâm + bề rộng
        val headRows = max(2, (0.25 * pick.h).roundToInt())
        var hx = 0.0; var hy = 0.0; var hn = 0; var hminX = width; var hmaxX = -1
        for (y in pick.minY until min(pick.maxY + 1, pick.minY + headRows)) for (x in pick.minX..pick.maxX) {
            val i = y * width + x
            if (staticOk(i)) { hx += x; hy += y; hn++; if (x < hminX) hminX = x; if (x > hmaxX) hmaxX = x }
        }
        if (hn == 0) return
        val e = Enemy(pick.minX, pick.maxX, pick.minY, pick.maxY, hx / hn, hy / hn, max(1.5, (hmaxX - hminX + 1) / 2.0))
        val old = enemy
        enemy = if (old != null && abs(old.centerX - e.centerX) < 0.1 * height && abs(old.centerY - e.centerY) < 0.1 * height)
            Enemy(e.minX, e.maxX, e.minY, e.maxY, 0.5 * old.headX + 0.5 * e.headX, 0.5 * old.headY + 0.5 * e.headY, 0.5 * old.headR + 0.5 * e.headR)
        else e
    }

    private fun distToBox(x: Double, y: Double, b: Blob): Double {
        val dx = max(0.0, max(b.minX - x, x - b.maxX))
        val dy = max(0.0, max(b.minY - y, y - b.maxY))
        return sqrt(dx * dx + dy * dy)
    }

    companion object {
        /** Góc (độ, y lật) từ (px,py) tới (x,y). */
        fun angleTo(px: Double, py: Double, x: Double, y: Double): Double = Math.toDegrees(atan2(py - y, x - px))
        fun wrapDeg(d: Double): Double { var a = d % 360.0; if (a > 180) a -= 360; if (a <= -180) a += 360; return a }
        @Suppress("unused") private const val TWO_PI = 2 * PI
    }
}
