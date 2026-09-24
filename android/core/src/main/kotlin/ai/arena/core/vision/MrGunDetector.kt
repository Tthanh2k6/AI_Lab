package ai.arena.core.vision

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
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
    /** Tâm nút "chơi lại" nếu nhận ra trên màn thua (px; NaN nếu không thấy). Chỉ tìm khi không có vạch ngắm. */
    val restartX: Double = Double.NaN, val restartY: Double = Double.NaN,
    /** Màn bắt đầu level ("TAP TO START"): một hàng ≥ 3 nút vuông rỗng cùng cỡ ở nửa dưới — tap giữa màn để vào. */
    val startScreen: Boolean = false,
    /** Tâm nút "NO THANKS" trên menu hồi sinh ("CONTINUE?" xem quảng cáo) — tap để từ chối (px; NaN nếu không thấy). */
    val declineX: Double = Double.NaN, val declineY: Double = Double.NaN,
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
        /** Số dải ngang của mô hình nền: một màu nền là "hạt giống" nền ở dải nó chiếm ≥ bandLocalFrac diện tích.
         *  Nhờ vậy bầu trời đen phía trên không biến khẩu súng đen ở giữa màn thành nền. */
        val bgBands: Int = 24,
        val bandLocalFrac: Double = 0.12,
        /** Điểm khớp màu nền ngoài dải hạt giống vẫn là nền nếu NỐI LIỀN với hạt giống qua các điểm cùng màu, cho phép
         *  bắc qua nét mảnh dày ≤ bgBridgePx (vạch mép bậc, vạch ngắm): bậc thang hẹp trên cùng dính vào bậc rộng bên dưới
         *  nên là nền, còn khẩu súng đen giữa màn không nối tới bầu trời đen. */
        val bgBridgePx: Int = 2,
        /** Điểm "trắng tinh": mọi kênh ≥ whiteMin. Đầu nhân vật (trang phục mặc định) và đầu địch thường là ô vuông trắng. */
        val whiteMin: Int = 225,
        /** Cỡ ô đầu trắng (tỉ lệ chiều cao màn): ≈ 9×7 px ở 440 px. */
        val headMinFrac: Double = 0.010,
        val headMaxFrac: Double = 0.040,
        /** Lõi (điểm trắng có cả 8 điểm kề trắng) phải phủ ≥ tỉ lệ này khung bao lõi và có ≥ headMinCore điểm. Nét chữ HUD
         *  1–2 px không có lõi; đầu nhân vật bị súng che một góc vẫn còn lõi thưa hơn ô vuông đầy → ngưỡng thấp. */
        val headMinDensity: Double = 0.3,
        val headMinCore: Int = 9,
        /** Tay cầm súng cách tâm đầu ≈ handOffsetFrac × bề rộng đầu về phía địch, ngang mép dưới đầu. */
        val handOffsetFrac: Double = 0.45,
        /** Nửa bề rộng dải quanh tia đã quét để khớp lại vạch bằng mọi điểm tiền cảnh tự do (không chỉ điểm chuyển động). */
        val rayFitHalfWidth: Int = 3,
        /** Tâm xoay giải từ các vạch không được rời neo (tay suy từ đầu trắng) quá tỉ lệ này chiều cao màn. */
        val pivotAnchorTolFrac: Double = 0.02,
        /** Đổi tâm xoay sang một neo mới (cách tâm hiện tại > 6 % màn) chỉ khi neo đó ổn định chừng này khung liên tiếp. */
        val anchorConfirmFrames: Int = 3,
        /** Nét mảnh tĩnh nằm ngang dài ≥ chừng này px = mép bậc thang → không tính khi quét tia (vạch ngắm luôn quay). */
        val edgeMinRun: Int = 12,
        /** Đỉnh quét nối tiếp góc dự đoán (± maxStepDeg) được ưu tiên nếu đạt ≥ tỉ lệ này của đỉnh cao nhất toàn dải. */
        val scanTrackPeakFrac: Double = 0.7,
        /** Đỉnh KHÔNG nối tiếp góc dự đoán chỉ được nhận khi trên tia có ≥ chừng này điểm đang chuyển động. */
        val scanNewPeakMinMoving: Int = 2,
        val motionThreshold: Int = 60,
        /** Tỉ lệ điểm chuyển động vượt mức này → cả cảnh đang chuyển (leo thang). */
        val transitionMotionFrac: Double = 0.025,
        val hudTopFrac: Double = 0.10,
        /** Số điểm chuyển động tối thiểu để khớp vạch (súng dài che gần hết vạch → chỉ còn ~8–10 px lộ ra). */
        val lineMinPixels: Int = 14,
        /** Số điểm tối thiểu trên tia quét góc (súng + vạch lộ ra). */
        val scanMinPixels: Int = 6,
        /** Doan lien tuc dai nhat tren tia (cho phep ho <= 2 px) phai >= gia tri nay. */
        val scanMinRun: Int = 5,
        val lineMinElongation: Double = 12.0,
        val pivotHistory: Int = 12,
        val pivotMinSpreadDeg: Double = 8.0,
        val pivotMaxResidual: Double = 4.0,
        val scanInnerFrac: Double = 0.03,
        val scanOuterFrac: Double = 0.55,
        /** Độ phủ tối thiểu, tính trên đoạn tia tới scanFillRadiusFrac·h (không tính cả tia dài vì vạch có thể ngắn). */
        val scanMinFill: Double = 0.08,
        val scanFillRadiusFrac: Double = 0.2,
        /** Số khung liên tiếp phía nhân vật (theo chuyển động) khác phía tâm xoay → đổi sang tâm xoay đã nhớ của phía đó. */
        val sideSwitchFrames: Int = 8,
        val blobMinCount: Int = 20,
        val blobMinDensity: Double = 0.22,
        val angleHistory: Int = 6,
        /** Tỉ lệ cao/rộng của khung bao địch (nhân vật Mr Gun gần vuông vì cầm súng ngang). */
        val enemyMinAspect: Double = 0.7,
        val enemyMaxAspect: Double = 4.5,
        /** Số khung giữ địch cũ khi tạm mất (vạch ngắm cắt ngang, nhấp nháy). */
        val enemyHoldFrames: Int = 30,
        /** Bán kính che vạch ngắm quanh tâm xoay (tỉ lệ chiều cao): chỉ phần gốc gần tâm mới "đứng yên". */
        val lineMaskRadiusFrac: Double = 0.15,
        /** Nửa góc mở của mặt nạ vạch (độ): đủ rộng để che cả thân súng dày quay cùng vạch. */
        val lineMaskHalfAngleDeg: Int = 6,
        /** Khoảng hở dọc tối đa (tỉ lệ chiều cao) để gộp hai mảnh chồng nhau theo x thành một nhân vật. */
        val figureSplitGapFrac: Double = 0.025,
        /** Chiều cao địch tối thiểu / tối đa (tỉ lệ chiều cao màn). */
        val enemyMinHeightFrac: Double = 0.02,
        val enemyMaxHeightFrac: Double = 0.25,
        /** Địch không bao giờ sát tâm xoay: loại mảnh vạch / chớp lửa gần súng. */
        val enemyMinDistFrac: Double = 0.06,
        /** Góc nhảy quá mức này giữa 2 khung → gián đoạn (lượt mới không bắt được chuyển cảnh), không phải đảo chiều. */
        val maxStepDeg: Double = 20.0,
        /** Góc quan sát vượt biên đã học quá mức này → biên sai, bỏ xác nhận. */
        val sweepPushTolDeg: Double = 1.5,
        /** Biên lắc chỉ xác nhận khi trước đảo chiều có ≥ boundConfirmBefore bước cùng chiều và sau đó ≥ boundConfirmAfter
         *  bước ngược chiều (một khung nhiễu của vạch ngắn không tạo được "đảo chiều"). */
        val boundConfirmBefore: Int = 3,
        val boundConfirmAfter: Int = 2,
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
    private val bandBins = IntArray(24 * (1 shl (3 * 4)))
    private val bandSamples = IntArray(24)
    /** Voi moi mau nen: cac ngan mau nam trong dung sai (mau phang co the roi vao 2 ngan ke nhau). */
    private var paletteNear: Array<IntArray> = emptyArray()
    /** [dải · palette.size + k] = cụm màu k chiếm ≥ bandLocalFrac dải đó (hạt giống nền). */
    private var bandDominant = BooleanArray(0)
    /** Bit k = điểm nằm trong dung sai của màu nền k (tối đa 32 màu nền). */
    private val matchMask = IntArray(width * height)

    private val fg = BooleanArray(width * height)
    private val mv = BooleanArray(width * height)
    /** Điểm trắng tinh VÀ là tiền cảnh (nền trắng không tính). */
    private val white = BooleanArray(width * height)
    /** Các ô đầu trắng của khung gần nhất (khung bao đã nở 1 px quanh lõi; count = số điểm lõi). */
    private var heads: List<Blob> = emptyList()
    /** Đầu nhân vật = ô đầu trắng thấp nhất (địch luôn đứng cao hơn trên cầu thang). */
    private var playerHead: Blob? = null
    /** Địch hiện tại được suy từ ô đầu trắng (chính xác hơn khối tĩnh) — khi mất đầu thì giữ, không rơi về khối tĩnh. */
    private var enemyByHead = false
    private val blocked = BooleanArray(width * height)
    /** Vùng vạch ngắm ước lượng từ góc khung trước — gốc vạch gần tâm xoay hầu như không dịch nên phải che riêng. */
    private val lineMask = BooleanArray(width * height)
    private var lastAngle = Double.NaN
    /** Dấu điểm đã lấy trong fitAlongRay (các ô lệch làm tròn có thể trùng một điểm ảnh). */
    private val rayStamp = IntArray(width * height)
    private var rayEpoch = 0
    /** Mép bậc thang: nét mảnh TĨNH nằm ngang dài ≥ edgeMinRun px (không tính khi quét tia). */
    private val hEdge = BooleanArray(width * height)
    /** Bước góc gần nhất (độ/khung) để dự đoán góc khung sau. */
    private var lastStep = 0.0
    /** Neo tâm xoay từ đầu trắng của nhân vật (NaN nếu chưa có / đã đổi phía mà chưa thấy đầu). */
    private var anchorX = Double.NaN
    private var anchorY = Double.NaN
    /** Neo mới khác xa tâm hiện tại: đếm số khung liên tiếp neo ổn định trước khi đổi. */
    private var anchorStreak = 0
    private var anchorStreakX = Double.NaN
    private var anchorStreakY = Double.NaN
    private val labels = IntArray(width * height)
    private val stack = IntArray(width * height)

    // Khớp vạch (điểm + hướng) của các khung gần nhất → tâm xoay
    private class LineFit(val mx: Double, val my: Double, val dx: Double, val dy: Double)
    private val fits = ArrayDeque<LineFit>()
    private var pivotX = Double.NaN
    private var pivotY = Double.NaN
    private var pivotValid = false
    private var pivotResidual = Double.NaN
    /** Tâm xoay đã nhớ theo phía (0 = nhân vật ở nửa trái, nhìn sang phải; 1 = ngược lại). Game luôn đặt
     *  nhân vật ở đúng hai vị trí màn hình này, nên sau khi đổi phía có thể dùng lại ngay dù vạch ngắm quá ngắn. */
    private val pivotMem = arrayOf(doubleArrayOf(Double.NaN, Double.NaN), doubleArrayOf(Double.NaN, Double.NaN))
    private var sideStreakSide = -1
    private var sideStreak = 0
    private fun sideOf(x: Double) = if (x < width / 2.0) 0 else 1

    // Lịch sử góc → vận tốc góc + biên lắc. Biên lắc là thuộc tính của game nên giữ xuyên suốt các
    // lượt, tách theo phía (địch bên phải: góc < 90°, bên trái: góc > 90°).
    private val angT = DoubleArray(16)
    private val angV = DoubleArray(16)
    private var angN = 0
    private var lastDir = 0
    /** Số bước liên tiếp cùng chiều lastDir; cực trị ứng viên đang chờ xác nhận. */
    private var dirRun = 0
    private var pendingExt = Double.NaN
    private var pendingIsMax = false
    private var pendingRun = 0
    /**
     * Một biên lắc. Chỉ "xác nhận" khi thấy đảo chiều thật; nếu góc quan sát vượt qua biên thì biên bị
     * đẩy theo và mất xác nhận (bằng chứng trực tiếp là biên cũ sai). Bộ điều khiển chỉ dùng biên đã xác nhận.
     */
    private class Bound {
        var value = Double.NaN
        var confirmed = false
        /** Số lần đảo chiều liên tiếp xác nhận cùng một biên (lệch ≤ 4°). Chỉ tin biên khi ≥ 2: một lần đảo chiều
         *  đơn lẻ có thể là nhiễu góc, và phản xạ dự đoán ở một biên sai sẽ bắn trượt. */
        var hits = 0
        val exposed: Double get() = if (confirmed && hits >= 2) value else Double.NaN
        fun reset() { value = Double.NaN; confirmed = false; hits = 0 }
        fun confirm(ext: Double) {
            if (value.isNaN() || !confirmed || abs(ext - value) > 4.0) { value = ext; hits = 1 }
            else { value = 0.5 * value + 0.5 * ext; hits++ }
            confirmed = true
        }
        fun push(a: Double, tol: Double, isMax: Boolean) {
            if (value.isNaN() || (if (isMax) a > value + tol else a < value - tol)) { value = a; confirmed = false; hits = 0 }
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

    // Truy cập chẩn đoán (test / lớp phủ), sau khi process() của khung gần nhất
    fun debugForeground(x: Int, y: Int): Boolean = fg[y * width + x]
    fun debugMoving(x: Int, y: Int): Boolean = mv[y * width + x]
    fun debugLineMask(x: Int, y: Int): Boolean = lineMask[y * width + x]
    fun debugPaletteSize(): Int = palette.size
    fun debugBlocked(x: Int, y: Int): Boolean = blocked[y * width + x]
    /** Số điểm trên tia theo góc (bin 0 = -30°) của lần quét gần nhất. */
    val debugScanCounts = IntArray(241)
    /** Chỉ dành cho test: ép tâm xoay để đánh giá bộ lọc địch trên một ảnh tĩnh (không có vạch chuyển động). */
    fun debugForcePivot(x: Double, y: Double) { pivotX = x; pivotY = y; pivotValid = true }
    /** Khối tĩnh của khung gần nhất: [minX, maxX, minY, maxY, count]. */
    fun debugBlobs(): List<IntArray> = lastBlobs.map { intArrayOf(it.minX, it.maxX, it.minY, it.maxY, it.count) }
    private var lastBlobs: List<Blob> = emptyList()
    /** Ô đầu trắng của khung gần nhất: [minX, maxX, minY, maxY, coreCount]. */
    fun debugHeads(): List<IntArray> = heads.map { intArrayOf(it.minX, it.maxX, it.minY, it.maxY, it.count) }
    fun debugWhite(x: Int, y: Int): Boolean = white[y * width + x]
    /** Đầu nhân vật của khung gần nhất: [minX, maxX, minY, maxY] hoặc null. */
    fun debugPlayerHead(): IntArray? = playerHead?.let { intArrayOf(it.minX, it.maxX, it.minY, it.maxY) }

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
        pivotMem[0][0] = Double.NaN; pivotMem[0][1] = Double.NaN; pivotMem[1][0] = Double.NaN; pivotMem[1][1] = Double.NaN
        sideStreakSide = -1; sideStreak = 0
        heads = emptyList(); playerHead = null
        lastStep = 0.0; anchorX = Double.NaN; anchorY = Double.NaN; anchorStreak = 0
    }

    private fun resetEngagement() {
        angN = 0; lastDir = 0
        enemy = null; enemyMissed = 0; enemyByHead = false
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
        classifyBackground(rgb)
        var moving = 0
        val prgb = prevFrame?.rgb
        val wm = p.whiteMin
        for (i in 0 until n) {
            val c = rgb[i]
            val m = prgb != null && Frame.colorDistance(c, prgb[i]) > p.motionThreshold
            mv[i] = m
            if (m) moving++
            white[i] = fg[i] && Frame.r(c) >= wm && Frame.g(c) >= wm && Frame.b(c) >= wm
        }
        val motionFrac = moving.toDouble() / n
        val transition = motionFrac > p.transitionMotionFrac
        prev = frame
        frameIndex++

        if (transition) {
            resetEngagement()
            fits.clear()
            lastAngle = Double.NaN; lastStep = 0.0
            heads = emptyList(); playerHead = null
            anchorX = Double.NaN; anchorY = Double.NaN; anchorStreak = 0
            debug = "transition motion=%.3f".format(motionFrac)
            return MrGunObservation(frameIndex - 1, tNanos, pivotX, pivotY, pivotValid, Double.NaN, Double.NaN, sweepMin, sweepMax, null, true, motionFrac)
        }

        // Ô đầu trắng (nhân vật + địch thường): tiền xử lý chính trên máy thật; đầu nhân vật = ô thấp nhất
        heads = whiteHeads()
        playerHead = null // chọn sau, khi đã có các điểm chuyển động (vạch phải mọc ra từ cạnh đầu)
        markHorizontalEdges()

        // Che vạch ngắm (vị trí khung trước ±2°) để phần gốc gần tâm không bị coi là khối tĩnh
        buildLineMask()

        // Khối tĩnh (nhân vật, địch, HUD)
        val blobs = staticBlobs()
        // Chặn các ĐIỂM tĩnh (nở 1 px) để quét tia / khớp vạch không bị nhân vật, địch, HUD làm nhiễu.
        // Không chặn theo khung bao: khẩu súng dày quay cùng vạch nằm trong khung bao của nhân vật nhưng đã được
        // mặt nạ vạch loại khỏi khối tĩnh, và chính nó là "kim chỉ hướng" khi vạch bị súng che gần hết.
        blocked.fill(false)
        run {
            val hud = (p.hudTopFrac * height).toInt()
            for (y in hud until height) for (x in 0 until width) {
                val i = y * width + x
                if (!staticOk(i)) continue
                for (dy in -1..1) { val yy = y + dy; if (yy < 0 || yy >= height) continue
                    for (dx in -1..1) { val xx = x + dx; if (xx >= 0 && xx < width) blocked[yy * width + xx] = true } }
            }
        }

        // Phía nhân vật = phía của khối tĩnh gần trọng tâm các điểm chuyển động nhất (vạch/súng dính vào nhân vật).
        // Sau khi đổi phía (leo thang), tâm xoay cũ sai → dùng tâm xoay đã nhớ của phía mới, hoặc bỏ tâm xoay.
        // Khớp vạch từ các điểm tiền cảnh đang chuyển động (dùng cả để kiểm tra đầu nhân vật bên dưới)
        val fit = fitMovingLine()
        run {
            val hud = (p.hudTopFrac * height).toInt()
            var mc = 0; var mx = 0.0; var my = 0.0
            for (i in hud * width until n) if (fg[i] && mv[i]) { mc++; mx += i % width; my += i / width }
            if (mc > 0) { mx /= mc; my /= mc }
            // Đầu trắng của nhân vật → neo tâm xoay: tay ở mép dưới đầu, lệch về phía địch. Ứng viên = ô đầu thấp nhất
            // (địch luôn đứng cao hơn) mà vạch/súng đang chuyển động mọc ra từ cạnh nó. Tâm xoay hiện tại (từ khớp vạch)
            // mà rời xa neo quá 6 % màn là sai (đổi phía, khớp nhiễu) → về neo ngay (hoặc tâm đã nhớ của phía đó nếu gần neo).
            var ax = Double.NaN; var ay = Double.NaN
            if (mc >= 6) {
                for (h in heads.filter { it.maxY <= 0.8 * height }.sortedByDescending { it.maxY }) {
                    val hcx = (h.minX + h.maxX) / 2.0
                    val e = enemy
                    val other = heads.filter { it !== h && it.maxY < h.minY }.minByOrNull { abs((it.minX + it.maxX) / 2.0 - hcx) }
                    val facing = when {
                        e != null && enemyByHead -> if (e.centerX >= hcx) 1 else -1
                        other != null -> if ((other.minX + other.maxX) / 2.0 >= hcx) 1 else -1
                        else -> if (mx >= hcx) 1 else -1
                    }
                    val x0 = hcx + facing * p.handOffsetFrac * h.w
                    val y0 = h.maxY + 1.0
                    if (!anchorAtLineRoot(x0, y0, fit, mc, mx, my)) continue
                    playerHead = h; ax = x0; ay = y0
                    break
                }
            }
            val ph = playerHead
            if (ph != null) {
                val far = pivotValid && (abs(pivotX - ax) > 0.06 * height || abs(pivotY - ay) > 0.06 * height)
                // Neo mới xa tâm hiện tại: phải ổn định vài khung (một khung nhiễu — chớp lửa, đầu địch bị vạch cắt — không đổi tâm),
                // trừ khi phía đó đã có tâm nhớ sát neo (đổi phía đã biết)
                if (far && abs(ax - anchorStreakX) <= 5 && abs(ay - anchorStreakY) <= 5) anchorStreak++ else { anchorStreak = 1; anchorStreakX = ax; anchorStreakY = ay }
                val m = pivotMem[sideOf(ax)]
                val memNear = !m[0].isNaN() && abs(m[0] - ax) <= 0.04 * height && abs(m[1] - ay) <= 0.04 * height
                if (!pivotValid || (far && (memNear || anchorStreak >= p.anchorConfirmFrames))) {
                    if (memNear) { pivotX = m[0]; pivotY = m[1] } else { pivotX = ax; pivotY = ay }
                    pivotValid = true; pivotResidual = Double.NaN; fits.clear(); resetEngagement()
                    sideStreakSide = -1; sideStreak = 0; anchorStreak = 0
                }
                if (abs(pivotX - ax) <= 0.06 * height && abs(pivotY - ay) <= 0.06 * height) { anchorX = ax; anchorY = ay }
            }
            if (ph == null && mc >= 6 && blobs.isNotEmpty()) {
                // Nhân vật = khối mà vạch mọc ra từ đó: có vạch khớp thì là khối nằm trên đường vạch và ở PHÍA SAU cùng
                // (địch cũng có thể nằm trên đường nhưng ở phía trước); không thì khối gần trọng tâm điểm chuyển động nhất
                val near = if (fit != null) {
                    val sgn = if ((mx - fit.mx) * fit.dx + (my - fit.my) * fit.dy >= 0) 1.0 else -1.0
                    blobs.filter { b ->
                        val cx = (b.minX + b.maxX) / 2.0; val cy = (b.minY + b.maxY) / 2.0
                        abs((cx - fit.mx) * fit.dy - (cy - fit.my) * fit.dx) <= 0.06 * height
                    }.minByOrNull { b -> (((b.minX + b.maxX) / 2.0 - fit.mx) * fit.dx + ((b.minY + b.maxY) / 2.0 - fit.my) * fit.dy) * sgn }
                } else null
                val nearBlob = near ?: blobs.minByOrNull { distToBox(mx, my, it) }!!
                val side = sideOf((nearBlob.minX + nearBlob.maxX) / 2.0)
                val guessX = if (side == 0) nearBlob.minX + 0.55 * nearBlob.h else nearBlob.maxX - 0.55 * nearBlob.h
                val guessY = nearBlob.minY + 0.5 * nearBlob.h
                if (!pivotValid && fits.size < 2 && anchorAtLineRoot(guessX, guessY, fit, mc, mx, my)) {
                    // Chưa có tâm xoay: dùng tâm đã nhớ của phía này, không thì ước lượng từ nhân vật
                    // (bàn tay ở mép hướng về địch, giữa chiều cao; nhân vật cao ≈ 2 × rộng nên lấy mép = mép xa + 0.55·h)
                    val m = pivotMem[side]
                    if (!m[0].isNaN() && distToBox(m[0], m[1], nearBlob) <= 0.12 * height) { pivotX = m[0]; pivotY = m[1] }
                    else { pivotX = guessX; pivotY = guessY }
                    pivotValid = true; pivotResidual = Double.NaN; resetEngagement()
                    anchorX = Double.NaN; anchorY = Double.NaN
                }
                // Tâm xoay hiện tại không còn dính vào nhân vật (xa hơn 12 % chiều cao) → đã đổi phía
                val stale = pivotValid && distToBox(pivotX, pivotY, nearBlob) > 0.12 * height
                if (stale && side == sideStreakSide) sideStreak++ else { sideStreakSide = if (stale) side else -1; sideStreak = if (stale) 1 else 0 }
                if (stale && fits.isEmpty() && sideStreak >= p.sideSwitchFrames) {
                    val m = pivotMem[side]
                    if (!m[0].isNaN() && distToBox(m[0], m[1], nearBlob) <= 0.12 * height) { pivotX = m[0]; pivotY = m[1]; resetEngagement() }
                    else pivotValid = false
                    sideStreak = 0
                    anchorX = Double.NaN; anchorY = Double.NaN
                }
            }
        }

        // Khớp vạch theo điểm chuyển động → cập nhật tâm xoay
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
        // Vạch ngắn (súng dài che, dịch < 1 px/khung nên ít điểm "chuyển động"): khớp lại bằng mọi điểm tự do quanh tia
        // đã quét. Đường này đi qua chính điểm ảnh của vạch, không ép qua tâm hiện tại → giao điểm nhiều khung vẫn tinh
        // chỉnh được tâm xoay (với súng máy đây là nguồn khớp chính).
        if (fit == null && !angle.isNaN() && pivotValid && !anchorX.isNaN()) {
            val rf = fitAlongRay(angle)
            if (rf != null) {
                fits.addLast(rf)
                while (fits.size > p.pivotHistory) fits.removeFirst()
                solvePivot()
            }
        }
        val omega = updateAngle(t, angle)
        lastStep = if (!angle.isNaN() && !lastAngle.isNaN() && abs(angle - lastAngle) <= p.maxStepDeg) angle - lastAngle else 0.0
        lastAngle = angle

        // Địch
        lastBlobs = blobs
        updateEnemy(blobs)

        debug = "pivot=(%.0f,%.0f%s res=%.1f fits=%d) angle=%.1f w=%.0f sweep=[%.0f,%.0f] blobs=%d heads=%d enemy=%s motion=%.3f".format(
            pivotX, pivotY, if (pivotValid) "" else "?", pivotResidual, fits.size, angle, omega, sweepMin, sweepMax, blobs.size, heads.size, enemy, motionFrac)
        val menu = if (angle.isNaN()) findMenu() else null
        return MrGunObservation(frameIndex - 1, tNanos, pivotX, pivotY, pivotValid, angle, omega, sweepMin, sweepMax, enemy, false, motionFrac,
            menu?.restartX ?: Double.NaN, menu?.restartY ?: Double.NaN, menu?.startScreen ?: false,
            menu?.declineX ?: Double.NaN, menu?.declineY ?: Double.NaN)
    }

    // ── Nền ─────────────────────────────────────────────────────────────────

    private fun computePalette(frame: Frame) {
        binCount.fill(0); binR.fill(0); binG.fill(0); binB.fill(0); bandBins.fill(0); bandSamples.fill(0)
        val rgb = frame.rgb
        val nb = p.bgBands
        val nbins = 1 shl (3 * 4)
        var samples = 0
        for (y in 0 until height) {
            val band = y * nb / height
            var i = y * width + (y and 1)
            val end = (y + 1) * width
            while (i < end) {
                val c = rgb[i]
                val q = Frame.quantize(c, p.colorBits)
                binCount[q]++
                binR[q] += Frame.r(c).toLong(); binG[q] += Frame.g(c).toLong(); binB[q] += Frame.b(c).toLong()
                bandBins[band * nbins + q]++
                bandSamples[band]++
                samples++
                i += 2
            }
        }
        val minCount = (p.dominantFrac * samples).roundToInt()
        // Tối đa 32 màu nền (mặt nạ bit theo điểm): giữ các ngăn chiếm diện tích lớn nhất
        val dominant = binCount.indices.filter { binCount[it] >= minCount }.sortedByDescending { binCount[it] }.take(32)
        palette = IntArray(dominant.size) { k ->
            val q = dominant[k]; val cnt = binCount[q]
            Frame.pack((binR[q] / cnt).toInt(), (binG[q] / cnt).toInt(), (binB[q] / cnt).toInt())
        }
        val bits = p.colorBits; val levels = 1 shl bits; val step = 256 / levels
        paletteNear = Array(palette.size) { k ->
            val near = ArrayList<Int>()
            for (q in 0 until nbins) {
                if (binCount[q] == 0) continue
                val qr = ((q shr (2 * bits)) and (levels - 1)) * step + step / 2
                val qg = ((q shr bits) and (levels - 1)) * step + step / 2
                val qb = (q and (levels - 1)) * step + step / 2
                if (Frame.colorDistance(Frame.pack(qr, qg, qb), palette[k]) <= p.bgTolerance + step) near.add(q)
            }
            near.toIntArray()
        }
        val kn = palette.size
        bandDominant = BooleanArray(nb * kn)
        for (band in 0 until nb) {
            val bn = bandSamples[band]
            for (k in 0 until kn) {
                var cnt = 0
                for (q in paletteNear[k]) cnt += bandBins[band * nbins + q]
                bandDominant[band * kn + k] = bn > 0 && cnt >= p.bandLocalFrac * bn
            }
        }
    }

    /**
     * Phân loại nền theo ngưỡng kép, tô fg[] = !nền. Điểm khớp màu nền k là nền nếu:
     *  • nằm trong dải mà cụm màu k chiếm ≥ bandLocalFrac (hạt giống — bầu trời đen phía trên không lan xuống
     *    khẩu súng đen giữa màn, vì ở dải đó màu đen thưa), HOẶC
     *  • nối liền với hạt giống qua một chuỗi điểm cùng khớp k (4 hướng, bắc qua ≤ bgBridgePx điểm không khớp
     *    để không bị vạch mép bậc thang / vạch ngắm cắt đứt) — bậc thang hẹp phía trên vẫn là nền vì dính
     *    vào bậc rộng bên dưới, còn mảng màu nền cô lập (vật thể trùng màu nền) thì là tiền cảnh.
     */
    private fun classifyBackground(rgb: IntArray) {
        val n = width * height
        val kn = palette.size
        val tol = p.bgTolerance
        for (i in 0 until n) {
            val c = rgb[i]
            var m = 0
            for (k in 0 until kn) if (Frame.colorDistance(c, palette[k]) <= tol) m = m or (1 shl k)
            matchMask[i] = m
            fg[i] = true
        }
        if (kn == 0) return
        val nb = p.bgBands
        val reach = p.bgBridgePx + 1
        val visited = labels // dùng tạm: visited[i] = k + 1 của cụm màu đã lan tới i
        visited.fill(0)
        for (k in 0 until kn) {
            val bit = 1 shl k
            val mark = k + 1
            var sp = 0
            for (y in 0 until height) {
                if (!bandDominant[(y * nb / height) * kn + k]) continue
                val row = y * width
                for (i in row until row + width) if (matchMask[i] and bit != 0) { visited[i] = mark; fg[i] = false; stack[sp++] = i }
            }
            while (sp > 0) {
                val i = stack[--sp]
                val x = i % width; val y = i / width
                for (dir in 0 until 4) {
                    val dx = DX4[dir]; val dy = DY4[dir]
                    for (d in 1..reach) {
                        val xx = x + d * dx; val yy = y + d * dy
                        if (xx < 0 || xx >= width || yy < 0 || yy >= height) break
                        val j = yy * width + xx
                        if (matchMask[j] and bit != 0) {
                            if (visited[j] != mark) { visited[j] = mark; fg[j] = false; stack[sp++] = j }
                            break
                        }
                    }
                }
            }
        }
    }

    // ── Đầu trắng ───────────────────────────────────────────────────────────

    /**
     * Ô đầu trắng: thành phần liên thông (8 hướng) của các điểm LÕI trắng — điểm trắng tiền cảnh có cả 8 điểm kề
     * trắng, nên vạch ngắm trắng (1–2 px) và nét chữ HUD biến mất, còn ô vuông đặc chỉ co 1 px mỗi cạnh. Khung bao
     * trả về đã nở lại 1 px. Lọc theo cỡ (headMinFrac..headMaxFrac chiều cao màn), dáng gần vuông và độ đặc của lõi;
     * nền trắng đã bị loại từ trước (white = trắng ∧ tiền cảnh) và thành phần quá lớn bị bỏ.
     */
    private fun whiteHeads(): List<Blob> {
        val hud = (p.hudTopFrac * height).toInt()
        val minPx = max(3, (p.headMinFrac * height).roundToInt())
        val maxPx = max(minPx + 1, (p.headMaxFrac * height).roundToInt())
        val cap = 4 * maxPx * maxPx
        val n = width * height
        labels.fill(0)
        val out = ArrayList<Blob>()
        var next = 1
        for (start in (hud + 1) * width until n - width) {
            if (!white[start] || labels[start] != 0) continue
            val sx = start % width
            if (sx == 0 || sx == width - 1 || !isWhiteCore(start)) continue
            if (out.size >= 16) break
            var sp = 0
            stack[sp++] = start; labels[start] = next
            val b = Blob(width, -1, height, -1, 0)
            while (sp > 0) {
                val i = stack[--sp]
                val x = i % width; val y = i / width
                b.count++
                if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x
                if (y < b.minY) b.minY = y; if (y > b.maxY) b.maxY = y
                if (b.count > cap) continue // quá lớn (mảng trắng): vẫn tiêu thụ hết nhưng không xét
                for (dy in -1..1) {
                    val ny = y + dy
                    if (ny <= hud || ny >= height - 1) continue
                    for (dx in -1..1) {
                        val nx = x + dx
                        if (nx < 1 || nx >= width - 1) continue
                        val j = ny * width + nx
                        if (labels[j] == 0 && white[j] && isWhiteCore(j)) { labels[j] = next; stack[sp++] = j }
                    }
                }
            }
            next++
            if (b.count > cap) continue
            val cw = b.w; val ch = b.h
            val w = cw + 2; val h = ch + 2
            if (w < minPx || w > maxPx || h < minPx || h > maxPx) continue
            val aspect = h.toDouble() / w
            if (aspect < 0.5 || aspect > 1.6) continue
            if (b.count < p.headMinCore || b.count < p.headMinDensity * cw * ch) continue
            out.add(Blob(max(0, b.minX - 1), min(width - 1, b.maxX + 1), max(0, b.minY - 1), min(height - 1, b.maxY + 1), b.count))
        }
        return out
    }

    /**
     * Điểm neo (tay cầm súng suy từ một ô đầu) có đúng là gốc của vạch/súng đang chuyển động không: điểm chuyển động
     * gần nhất cách ≤ 12 % màn (nòng súng sát tay); nếu khớp được vạch thì vạch đi qua cách neo ≤ 5 % màn và ≤ 15 %
     * điểm chuyển động nằm PHÍA SAU neo (vạch mọc ra từ neo, không xuyên qua — đầu địch bị vạch cắt ngang thì bị loại).
     */
    private fun anchorAtLineRoot(ax: Double, ay: Double, fit: LineFit?, mc: Int, mx: Double, my: Double): Boolean {
        if (mc < 6) return false
        val hud = (p.hudTopFrac * height).toInt()
        val nearLim = 0.12 * height
        var nearest = Double.MAX_VALUE
        var behind = 0
        val sgn = if (fit != null) (if ((mx - ax) * fit.dx + (my - ay) * fit.dy >= 0) 1.0 else -1.0) else 1.0
        for (y in hud until height) {
            val row = y * width
            for (x in 0 until width) {
                val i = row + x
                if (!(fg[i] && mv[i])) continue
                val dx = x - ax; val dy = y - ay
                val d = dx * dx + dy * dy
                if (d < nearest) nearest = d
                if (fit != null && (dx * fit.dx + dy * fit.dy) * sgn < -3.0) behind++
            }
        }
        if (nearest > nearLim * nearLim) return false
        if (fit != null) {
            val perp = abs((ax - fit.mx) * fit.dy - (ay - fit.my) * fit.dx)
            if (perp > 0.05 * height) return false
            if (behind > 0.15 * mc) return false
        }
        return true
    }

    private fun isWhiteCore(i: Int): Boolean {
        val w = width
        return white[i - w - 1] && white[i - w] && white[i - w + 1] && white[i - 1] && white[i + 1] &&
            white[i + w - 1] && white[i + w] && white[i + w + 1]
    }

    // ── Vạch ngắm ───────────────────────────────────────────────────────────

    private fun buildLineMask() {
        lineMask.fill(false)
        if (!pivotValid || lastAngle.isNaN()) return
        // Chỉ che phần gốc gần tâm xoay: xa hơn, vạch dịch ≥ 1 px/khung nên đã bị loại nhờ mặt nạ chuyển động,
        // còn che cả chiều dài sẽ cắt đôi địch mỗi khi vạch quét qua nó.
        val r1 = (p.lineMaskRadiusFrac * height).roundToInt() + 4
        for (da in -p.lineMaskHalfAngleDeg..p.lineMaskHalfAngleDeg) {
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
        // Có neo từ đầu trắng: nghiệm rời neo quá xa là khớp nhiễu (mảnh súng, chớp lửa) → bỏ
        if (!anchorX.isNaN() && (abs(x - anchorX) > p.pivotAnchorTolFrac * height || abs(y - anchorY) > p.pivotAnchorTolFrac * height)) return
        pivotResidual = res
        if (pivotValid && abs(x - pivotX) + abs(y - pivotY) < 0.15 * height) { pivotX = 0.7 * pivotX + 0.3 * x; pivotY = 0.7 * pivotY + 0.3 * y }
        else { pivotX = x; pivotY = y; resetEngagement() }
        pivotValid = true
        pivotMem[sideOf(pivotX)][0] = pivotX; pivotMem[sideOf(pivotX)][1] = pivotY
    }

    /**
     * Quét tia quanh tâm xoay: góc có nhiều điểm tiền cảnh nhất. Gần tâm (bán kính che vạch) tính cả thân súng
     * — súng quay cùng vạch và với súng dài thì đó là phần "kim chỉ hướng" chủ yếu; xa hơn bỏ qua các khối tĩnh
     * (nhân vật, địch). Chỉ quét nửa hướng về phía địch (nhân vật ở nửa trái → −30…120°, nửa phải → 60…210°)
     * để thân/đầu nhân vật phía sau không tạo đỉnh giả.
     */
    private fun scanAngle(frame: Frame): Double {
        val r0 = max(4, (p.scanInnerFrac * height).roundToInt())
        val r1 = (p.scanOuterFrac * height).roundToInt()
        val rFill = (p.scanFillRadiusFrac * height).roundToInt()
        val hud = (p.hudTopFrac * height).toInt()
        val bins = 241 // −30° … 210°
        // Hướng nhìn: theo địch đã biết, không thì theo góc khung trước, không nữa thì quét cả dải
        val e = enemy
        val facing = when {
            e != null -> if (e.centerX > pivotX) 1 else -1
            !lastAngle.isNaN() -> if (cos(Math.toRadians(lastAngle)) >= 0) 1 else -1
            else -> 0
        }
        val bLo = when (facing) { 1 -> 0; -1 -> 90; else -> 0 }
        val bHi = when (facing) { 1 -> 150; -1 -> 240; else -> 240 }
        // Hai bộ đếm: chỉ tiền cảnh (chính xác — vạch mô phỏng / vạch dài) và tiền cảnh ∪ đang chuyển động (dự phòng khi
        // vạch quá ngắn: thân súng tối trùng màu bậc thang vẫn quay cùng vạch; vị trí cũ + mới cùng được tính nên lệch
        // ≈ nửa bước góc, chấp nhận được). Bỏ mép bậc thang (nét mảnh tĩnh nằm ngang) và mọi điểm tĩnh đã chặn.
        val counts = IntArray(bins); val score = IntArray(bins)      // tiền cảnh; score = + thưởng điểm trắng tinh
        val countsAll = IntArray(bins); val scoreAll = IntArray(bins)
        val movingC = IntArray(bins)
        val reach = IntArray(bins)
        for (b in bLo..bHi) {
            val a = Math.toRadians(-30.0 + b)
            val cx = cos(a); val sy = -sin(a)
            var c = 0; var wc = 0; var ca = 0; var m = 0; var rr = 0
            var run = 0; var bestRun = 0; var gap = 0; var runA = 0; var bestRunA = 0; var gapA = 0
            var r = r0
            while (r <= r1) {
                val x = (pivotX + r * cx).roundToInt(); val y = (pivotY + r * sy).roundToInt()
                if (x < 0 || x >= width || y < hud || y >= height) break
                if (r <= rFill) rr++
                val i = y * width + x
                val free = !blocked[i] && !hEdge[i]
                if (fg[i] && free) { c++; if (white[i]) wc++; run += 1 + gap; gap = 0; if (run > bestRun) bestRun = run }
                else { gap++; if (gap > 2) { run = 0; gap = 0 } }
                if ((fg[i] || mv[i]) && free) { ca++; if (mv[i]) m++; runA += 1 + gapA; gapA = 0; if (runA > bestRunA) bestRunA = runA }
                else { gapA++; if (gapA > 2) { runA = 0; gapA = 0 } }
                r++
            }
            val ok = bestRun >= p.scanMinRun; val okA = bestRunA >= p.scanMinRun
            counts[b] = if (ok) c else 0; score[b] = if (ok) c + wc else 0
            countsAll[b] = if (okA) ca else 0; scoreAll[b] = if (okA) ca + wc else 0
            movingC[b] = m; reach[b] = rr
        }
        System.arraycopy(counts, 0, debugScanCounts, 0, bins)
        val a1 = pickScanPeak(counts, score, movingC, reach, bLo, bHi, bins)
        if (!a1.isNaN()) return a1
        // Dự phòng theo điểm chuyển động chỉ khi tâm xoay được neo bằng đầu trắng (súng thật che vạch); mô phỏng / trang
        // phục khác giữ cách quét cũ để không nhiễu góc.
        if (anchorX.isNaN()) return Double.NaN
        return pickScanPeak(countsAll, scoreAll, movingC, reach, bLo, bHi, bins)
    }

    /**
     * Chọn đỉnh quét: ưu tiên đỉnh nối tiếp góc dự đoán (góc trước + bước trước) nếu đạt ≥ scanTrackPeakFrac đỉnh cao nhất;
     * đỉnh mới ở nơi khác phải có điểm đang chuyển động (vạch ngắm luôn quay, nét tĩnh giả thì không). Nội suy parabol.
     */
    private fun pickScanPeak(counts: IntArray, score: IntArray, movingC: IntArray, reach: IntArray, bLo: Int, bHi: Int, bins: Int): Double {
        var best = -1; var bestS = 0
        for (b in bLo..bHi) if (score[b] > bestS) { bestS = score[b]; best = b }
        if (best < 0) return Double.NaN
        var pick = -1
        if (!lastAngle.isNaN()) {
            val pred = lastAngle + lastStep
            val lo = max(bLo, (pred - p.maxStepDeg + 30).roundToInt()); val hi = min(bHi, (pred + p.maxStepDeg + 30).roundToInt())
            var nb = -1; var nc = 0
            for (b in lo..hi) if (score[b] > nc) { nc = score[b]; nb = b }
            if (nb >= 0 && nc >= p.scanTrackPeakFrac * bestS) pick = nb
        }
        if (pick < 0) {
            if (movingC[best] < p.scanNewPeakMinMoving) return Double.NaN
            pick = best
        }
        if (reach[pick] == 0 || counts[pick] < p.scanMinFill * reach[pick] || counts[pick] < p.scanMinPixels) return Double.NaN
        var angle = -30.0 + pick
        if (pick in 1 until bins - 1) {
            val c0 = score[pick - 1].toDouble(); val c1 = score[pick].toDouble(); val c2 = score[pick + 1].toDouble()
            val denom = c0 - 2 * c1 + c2
            if (denom < -1e-9) angle += 0.5 * (c0 - c2) / denom
        }
        return angle
    }

    /**
     * Đánh dấu mép bậc thang: điểm tiền cảnh TĨNH, mảnh theo chiều dọc (2 hàng trên/dưới là nền), nằm trong một
     * đoạn ngang liên tục dài ≥ edgeMinRun px. Vạch ngắm chỉ trùng dạng này khi nằm ngang đúng 0° và đứng yên.
     */
    private fun markHorizontalEdges() {
        val hud = (p.hudTopFrac * height).toInt()
        java.util.Arrays.fill(hEdge, 0, hud * width, false)
        for (y in hud until height) {
            val row = y * width
            var x = 0
            while (x < width) {
                val i = row + x
                val edge = fg[i] && !mv[i] && y >= 2 && y + 2 < height && !fg[i - 2 * width] && !fg[i + 2 * width]
                if (!edge) { hEdge[i] = false; x++; continue }
                var x1 = x
                while (x1 + 1 < width) {
                    val j = row + x1 + 1
                    if (fg[j] && !mv[j] && !fg[j - 2 * width] && !fg[j + 2 * width]) x1++ else break
                }
                val mark = x1 - x + 1 >= p.edgeMinRun
                for (k in x..x1) hEdge[row + k] = mark
                x = x1 + 1
            }
        }
    }

    /**
     * Khớp PCA các điểm tiền cảnh tự do trong dải ±rayFitHalfWidth px quanh tia ở góc đã quét, từ tâm tới hết đoạn
     * vạch (dừng khi hở > 6 px). Dùng khi không khớp được theo điểm chuyển động (vạch ngắn / dịch chậm).
     */
    private fun fitAlongRay(angleDeg: Double): LineFit? {
        val r0 = max(4, (p.scanInnerFrac * height).roundToInt())
        val r1 = (p.scanOuterFrac * height).roundToInt()
        val hud = (p.hudTopFrac * height).toInt()
        val a = Math.toRadians(angleDeg)
        val cx = cos(a); val sy = -sin(a)
        val nx = -sy; val ny = cx
        val hw = p.rayFitHalfWidth
        rayEpoch++
        var cnt = 0; var sx = 0.0; var syy = 0.0; var sxx = 0.0; var sy2 = 0.0; var sxy = 0.0
        var gap = 0
        var r = r0
        while (r <= r1) {
            var hit = false
            for (o in -hw..hw) {
                val x = (pivotX + r * cx + o * nx).roundToInt(); val y = (pivotY + r * sy + o * ny).roundToInt()
                if (x < 0 || x >= width || y < hud || y >= height) continue
                val i = y * width + x
                if (rayStamp[i] == rayEpoch || !fg[i] || blocked[i]) continue
                rayStamp[i] = rayEpoch
                hit = true; cnt++; sx += x; syy += y; sxx += x.toDouble() * x; sy2 += y.toDouble() * y; sxy += x.toDouble() * y
            }
            if (hit) gap = 0 else { gap++; if (gap > 6 && cnt > 0) break }
            r++
        }
        if (cnt < p.lineMinPixels) return null
        return pca(cnt, sx, syy, sxx, sy2, sxy)
    }

    /** Cập nhật lịch sử góc; trả về vận tốc góc (độ/s) hoặc NaN. Phát hiện đảo chiều để học biên lắc. */
    private fun updateAngle(t: Double, angle: Double): Double {
        if (angle.isNaN()) { if (angN > 0 && t - angT[angN - 1] > 0.25) angN = 0; return Double.NaN }
        if (angN > 0 && abs(angle - angV[angN - 1]) > p.maxStepDeg) {
            // Nhảy góc lớn: lượt mới bắt đầu mà không bắt được chuyển cảnh → làm mới lịch sử, không coi là đảo chiều
            angN = 0
        }
        if (angN == 0) { lastDir = 0; dirRun = 0; pendingExt = Double.NaN }
        if (angN > 0) {
            val d = angle - angV[angN - 1]
            val dir = if (d > 0.3) 1 else if (d < -0.3) -1 else 0
            if (dir != 0 && lastDir != 0 && dir != lastDir) {
                // Đảo chiều: điểm trước là cực trị ỨNG VIÊN — chỉ khi trước đó đã đi đủ bước cùng chiều (không phải một
                // khung nhiễu của vạch ngắn); xác nhận sau boundConfirmAfter bước theo chiều mới
                if (dirRun >= p.boundConfirmBefore) { pendingExt = angV[angN - 1]; pendingIsMax = lastDir > 0; pendingRun = 0 }
                else pendingExt = Double.NaN
                // giữ lại 2 điểm cuối để tính vận tốc mới
                angT[0] = angT[angN - 1]; angV[0] = angV[angN - 1]; angN = 1
                dirRun = 0
            }
            if (dir != 0) {
                dirRun = if (dir == lastDir) dirRun + 1 else 1
                lastDir = dir
                if (!pendingExt.isNaN()) {
                    if ((dir > 0) != pendingIsMax) {
                        pendingRun++
                        if (pendingRun >= p.boundConfirmAfter) {
                            // Vạch vẽ SAU nhân vật: quét qua địch thì phần lộ ra ngắn lại, góc đo khựng/nhảy như đảo chiều giả
                            // ngay tại hướng địch → không xác nhận biên trong ±12° quanh hướng địch
                            val e = enemy
                            val nearEnemy = e != null && pivotValid && abs(wrapDeg(pendingExt - angleTo(pivotX, pivotY, e.centerX, (e.minY + e.maxY) / 2.0))) < 12.0
                            if (!nearEnemy) { if (pendingIsMax) boundMax(pendingExt).confirm(pendingExt) else boundMin(pendingExt).confirm(pendingExt) }
                            pendingExt = Double.NaN
                        }
                    } else pendingExt = Double.NaN
                }
            }
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
        // Gộp các khối kề nhau (nhân vật bị vạch ngắm hoặc khoảng hở cắt đôi). Khẩu súng của địch có thể
        // cùng màu nền (xám) và cắt ngang thân → hai mảnh chồng nhau theo x, cách nhau tới ~2.5 % màn cũng gộp.
        val vGap = max(3, (p.figureSplitGapFrac * height).roundToInt())
        var merged = true
        while (merged) {
            merged = false
            outer@ for (i in out.indices) for (j in i + 1 until out.size) {
                val a = out[i]; val b = out[j]
                val near = a.minX <= b.maxX + 3 && b.minX <= a.maxX + 3 && a.minY <= b.maxY + 3 && b.minY <= a.maxY + 3
                val overlapX = min(a.maxX, b.maxX) - max(a.minX, b.minX) + 1
                val stacked = overlapX >= 0.5 * min(a.w, b.w) && a.minY <= b.maxY + vGap && b.minY <= a.maxY + vGap
                if (near || stacked) {
                    a.minX = min(a.minX, b.minX); a.maxX = max(a.maxX, b.maxX)
                    a.minY = min(a.minY, b.minY); a.maxY = max(a.maxY, b.maxY); a.count += b.count
                    out.removeAt(j); merged = true; break@outer
                }
            }
        }
        return out.filter { it.count >= p.blobMinCount }
    }

    private class MenuHint(
        val restartX: Double, val restartY: Double, val startScreen: Boolean,
        val declineX: Double = Double.NaN, val declineY: Double = Double.NaN,
    )

    /**
     * Nhận diện màn menu khi KHÔNG có vạch ngắm, dựa trên các "ô vuông rỗng" (viền kín, ruột thưa) ở nửa dưới:
     *  • màn thua: đúng một ô rộng 15–35 % màn nằm giữa theo chiều ngang → nút "chơi lại" (tap vào tâm);
     *  • màn bắt đầu level: một hàng ≥ 3 ô cùng cỡ, cùng độ cao (ELITE / BLACKLIST / OUTFITS / GUN STORE)
     *    → "TAP TO START": tap giữa màn, KHÔNG tap vào ô nào;
     *  • menu hồi sinh "CONTINUE?": hai khung chữ nhật rỗng, rộng 30–60 % màn, xếp chồng ở giữa
     *    (trên = xem quảng cáo để tiếp tục, dưới = NO THANKS) → tap khung DƯỚI.
     * Banner quảng cáo (khối rộng, ruột đặc) không thoả điều kiện nào → không bao giờ bị tap.
     */
    private fun findMenu(): MenuHint? {
        val y0 = height / 2
        labels.fill(0)
        val out = ArrayList<Blob>()
        var next = 1
        for (start in y0 * width until width * height) {
            if (!fg[start] || labels[start] != 0) continue
            if (out.size >= 64) break
            val b = Blob(start % width, start % width, start / width, start / width, 0)
            var sp = 0; stack[sp++] = start; labels[start] = next
            while (sp > 0) {
                val i = stack[--sp]
                val x = i % width; val y = i / width
                b.count++
                if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x
                if (y < b.minY) b.minY = y; if (y > b.maxY) b.maxY = y
                for (dy in -1..1) for (dx in -1..1) {
                    if (dx == 0 && dy == 0) continue
                    val nx = x + dx; val ny = y + dy
                    if (nx < 0 || nx >= width || ny < y0 || ny >= height) continue
                    val j = ny * width + nx
                    if (fg[j] && labels[j] == 0) { labels[j] = next; stack[sp++] = j }
                }
            }
            if (b.count >= 8) out.add(b)
            next++
        }
        // Gộp khối kề / lồng nhau (viền bị đứt, biểu tượng nằm trong viền)
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
        // Menu hồi sinh: ≥ 2 khung chữ nhật rỗng, rộng, nằm giữa, xếp chồng → nút dưới cùng là NO THANKS
        val wideFrames = out.filter { b ->
            val aspect = b.h.toDouble() / b.w
            b.w >= 0.30 * width && b.w <= 0.60 * width && aspect in 0.15..0.5 &&
                abs((b.minX + b.maxX) / 2.0 - width / 2.0) <= 0.06 * width && isFramedSquare(b)
        }
        if (wideFrames.size >= 2) {
            val lowest = wideFrames.maxByOrNull { it.maxY }!!
            val above = wideFrames.filter { it !== lowest && lowest.minY - it.maxY >= 0.01 * height }
            if (above.isNotEmpty()) return MenuHint(Double.NaN, Double.NaN, false, (lowest.minX + lowest.maxX) / 2.0, (lowest.minY + lowest.maxY) / 2.0)
        }
        val squares = out.filter { b ->
            val aspect = b.h.toDouble() / b.w
            b.w >= 0.12 * width && b.w <= 0.35 * width && aspect in 0.75..1.3 &&
                (b.minY + b.maxY) / 2.0 >= 0.55 * height && isFramedSquare(b)
        }
        if (squares.isEmpty()) return null
        // Hàng nút: ≥ 3 ô cùng cỡ (rộng lệch ≤ 40 %) và cùng độ cao (tâm lệch ≤ 5 % màn)
        for (a in squares) {
            val row = squares.filter { b ->
                max(a.w, b.w) <= 1.4 * min(a.w, b.w) && abs((a.minY + a.maxY) - (b.minY + b.maxY)) / 2.0 <= 0.05 * height
            }
            if (row.size >= 3) return MenuHint(Double.NaN, Double.NaN, true)
        }
        // Nút chơi lại: ô rộng ≥ 15 % màn, nằm giữa; không có ô nào khác cùng cỡ
        val centred = squares.filter { b -> b.w >= 0.15 * width && abs((b.minX + b.maxX) / 2.0 - width / 2.0) <= 0.06 * width }
        val best = centred.maxByOrNull { it.count } ?: return null
        val rival = squares.any { it !== best && it.w >= 0.7 * best.w }
        if (rival) return null
        return MenuHint((best.minX + best.maxX) / 2.0, (best.minY + best.maxY) / 2.0, false)
    }

    /** Ô vuông rỗng: 4 cạnh của khung bao đều có nét (≥ 60 % chiều dài) và ruột (50 % giữa) thưa (≤ 55 %). */
    private fun isFramedSquare(b: Blob): Boolean {
        val t = max(2, (0.08 * b.w).roundToInt())
        fun rows(y0: Int, y1: Int): Double {
            var cols = 0
            for (x in b.minX..b.maxX) { var hit = false; for (y in y0..y1) if (fg[y * width + x]) { hit = true; break }; if (hit) cols++ }
            return cols.toDouble() / b.w
        }
        fun cols(x0: Int, x1: Int): Double {
            var rows = 0
            for (y in b.minY..b.maxY) { var hit = false; for (x in x0..x1) if (fg[y * width + x]) { hit = true; break }; if (hit) rows++ }
            return rows.toDouble() / b.h
        }
        val top = rows(b.minY, min(b.maxY, b.minY + t)); val bottom = rows(max(b.minY, b.maxY - t), b.maxY)
        val left = cols(b.minX, min(b.maxX, b.minX + t)); val right = cols(max(b.minX, b.maxX - t), b.maxX)
        if (min(min(top, bottom), min(left, right)) < 0.6) return false
        val ix0 = b.minX + b.w / 4; val ix1 = b.maxX - b.w / 4; val iy0 = b.minY + b.h / 4; val iy1 = b.maxY - b.h / 4
        var n = 0; var f = 0
        for (y in iy0..iy1) for (x in ix0..ix1) { n++; if (fg[y * width + x]) f++ }
        return n > 0 && f.toDouble() / n <= 0.55
    }

    private fun updateEnemy(blobs: List<Blob>) {
        if (!pivotValid) { enemy = null; enemyByHead = false; return }
        // Đường chính: ô đầu trắng của địch (không phải đầu nhân vật, ở phía trên tâm xoay, không sát tâm)
        val ph = playerHead
        // Khoảng cách tính tới ĐẦU (địch đứng cao hơn nên đầu luôn xa tâm xoay, kể cả khi chỉ cách một bậc)
        val minDist = p.enemyMinDistFrac * height
        val headCands = heads.filter { h ->
            h !== ph && h.maxY < pivotY + 0.05 * height &&
                hypot((h.minX + h.maxX) / 2.0 - pivotX, (h.minY + h.maxY) / 2.0 - pivotY) >= minDist
        }
        val old = enemy
        val hb = headCands.filter { old != null && enemyByHead && abs((it.minX + it.maxX) / 2.0 - old.headX) < 0.1 * height && abs((it.minY + it.maxY) / 2.0 - old.headY) < 0.1 * height }
            .maxByOrNull { it.count } ?: headCands.maxByOrNull { it.count }
        if (hb != null) {
            // Thân = khối tĩnh chạm ô đầu (cỡ hợp lý); không có thì dựng thân ≈ 2.5 × cao đầu dưới ô đầu
            val body = blobs.filter { b ->
                b.minX <= hb.maxX + 2 && b.maxX >= hb.minX - 2 && b.minY <= hb.maxY + 3 && b.maxY >= hb.minY - 2 &&
                    b.w <= 3 * hb.w && b.h <= p.enemyMaxHeightFrac * height
            }.maxByOrNull { it.count }
            val minX = body?.let { min(it.minX, hb.minX) } ?: hb.minX
            val maxX = body?.let { max(it.maxX, hb.maxX) } ?: hb.maxX
            val minY = body?.let { min(it.minY, hb.minY) } ?: hb.minY
            val maxY = body?.let { max(it.maxY, hb.maxY) } ?: min(height - 1, hb.maxY + (2.5 * hb.h).roundToInt())
            enemy = Enemy(minX, maxX, minY, maxY, (hb.minX + hb.maxX) / 2.0, (hb.minY + hb.maxY) / 2.0, (hb.w + 1) / 2.0)
            enemyByHead = true; enemyMissed = 0
            return
        }
        if (enemyByHead && old != null) {
            // Đầu trắng vừa mất (vạch/chớp lửa che, nhấp nháy): giữ địch cũ, không rơi về khối tĩnh kém chính xác hơn
            enemyMissed++
            if (enemyMissed > p.enemyHoldFrames) { enemy = null; enemyByHead = false }
            return
        }
        // Đường dự phòng (đầu không trắng: trùm, trang phục khác, mô phỏng): khối tĩnh dáng đứng
        // Nhân vật = khối gần tâm xoay nhất
        val player = blobs.minByOrNull { distToBox(pivotX, pivotY, it) }
        val playerArea = player?.let { it.w * it.h }?.toDouble() ?: (0.12 * height * 0.06 * height)
        val playerDist = player?.let { distToBox(pivotX, pivotY, it) } ?: Double.MAX_VALUE
        val cands = blobs.filter { b ->
            if (b === player && playerDist < 0.08 * height) return@filter false
            val density = b.count.toDouble() / (b.w * b.h)
            val aspect = b.h.toDouble() / b.w
            val area = (b.w * b.h).toDouble()
            density >= p.blobMinDensity && aspect in p.enemyMinAspect..p.enemyMaxAspect && area >= 0.15 * playerArea && area <= 3.0 * playerArea &&
                b.maxY < pivotY + 0.05 * height && b.h >= p.enemyMinHeightFrac * height && b.h <= p.enemyMaxHeightFrac * height &&
                hypot((b.minX + b.maxX) / 2.0 - pivotX, b.minY + 0.125 * b.h - pivotY) >= minDist
        }
        val pick = cands.maxByOrNull { it.count }
        if (pick == null) {
            enemyMissed++
            if (enemyMissed > p.enemyHoldFrames) enemy = null
            return
        }
        // Đầu = 25 % hàng trên cùng: trọng tâm + bề rộng
        val headRows = max(2, (0.25 * pick.h).roundToInt())
        var hx = 0.0; var hy = 0.0; var hn = 0; var hminX = width; var hmaxX = -1
        for (y in pick.minY until min(pick.maxY + 1, pick.minY + headRows)) for (x in pick.minX..pick.maxX) {
            val i = y * width + x
            if (staticOk(i)) { hx += x; hy += y; hn++; if (x < hminX) hminX = x; if (x > hmaxX) hmaxX = x }
        }
        if (hn == 0) return
        val e = Enemy(pick.minX, pick.maxX, pick.minY, pick.maxY, hx / hn, hy / hn, max(1.5, (hmaxX - hminX + 1) / 2.0))
        // Vạch ngắm / mặt nạ vạch cắt ngang địch đứng gần → chỉ còn một mảnh chồng lên địch cũ nhưng nhỏ hơn hẳn:
        // giữ địch cũ (đầu thật không đổi), không nhận mảnh
        if (old != null && !enemyByHead && old.minX <= e.maxX && e.minX <= old.maxX && old.minY <= e.maxY && e.minY <= old.maxY &&
            (e.maxY - e.minY + 1) < 0.75 * (old.maxY - old.minY + 1) && enemyMissed < p.enemyHoldFrames) {
            enemyMissed++
            return
        }
        enemyMissed = 0
        enemyByHead = false
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
        private val DX4 = intArrayOf(1, -1, 0, 0)
        private val DY4 = intArrayOf(0, 0, 1, -1)
    }
}
