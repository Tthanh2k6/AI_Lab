package ai.arena.core.vision

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * Bộ nhận diện Flappy Bird DÙNG CHUNG cho các bản clone — không dựa vào màu hay sprite của một
 * game cụ thể mà vào cấu trúc chung của thể loại:
 *
 *  • Màn chơi cuộn sang trái với một tốc độ; ống và đất cùng trôi ở tốc độ đó.
 *  • Ống là cột cao có biên dọc dài: ống trên nối từ mép trên xuống khe, ống dưới từ khe xuống ĐẤT —
 *    nên điểm kết thúc của các biên ống dưới chính là mép đất.
 *  • Nền (trời, thành phố) được học theo từng hàng: màu phổ biến nhất của các cột KHÔNG phải ống.
 *  • Chim là khối nhỏ khác nền, không trôi theo màn, x gần như cố định nhưng y thay đổi.
 *
 * Mọi ngưỡng kích thước là tỉ lệ theo chiều cao khung để không phụ thuộc độ phân giải.
 */
class FlappyDetector(val width: Int, val height: Int, private val p: Params = Params()) {

    class Params(
        /** Ngưỡng gradient ngang để coi là biên dọc. */
        val edgeThreshold: Int = 24,
        /** Cột được coi là biên ống nếu có chuỗi biên dọc ≥ tỉ lệ này × chiều cao vùng chơi. */
        val minBorderRunFrac: Double = 0.12,
        /** Chỉ chuỗi biên dài ≥ tỉ lệ này × chiều cao khung mới được bỏ phiếu cho mép đất. */
        val groundVoteMinRunFrac: Double = 0.20,
        val groundDecay: Double = 0.97,
        val groundMinVotes: Double = 12.0,
        val defaultGroundFrac: Double = 0.87,
        /** Khoảng cách màu L1 để coi một điểm KHÁC nền. */
        val bgTolerance: Int = 60,
        val minPipeWidthFrac: Double = 0.03,
        val maxPipeWidthFrac: Double = 0.30,
        val minGapFrac: Double = 0.06,
        val maxGapFrac: Double = 0.70,
        /** Cho phép thanh HUD ở mép trên / lệch mép đất tới tỉ lệ này × chiều cao khi quét cột ống. */
        val hudSlackFrac: Double = 0.12,
        val groundSlackFrac: Double = 0.08,
        /** Khoảng cách màu L1 để coi một điểm là "không trôi theo màn" (so với khung trước đã bù cuộn). */
        val motionThreshold: Int = 60,
        val maxShiftFrac: Double = 0.12,
        val birdMinRadiusFrac: Double = 0.008,
        val birdMaxRadiusFrac: Double = 0.06,
        val birdColorTolerance: Int = 75,
        val trackGateFrac: Double = 0.10,
        val maxCoastFrames: Int = 8,
        /** Số khung liên tiếp một ứng viên phải ổn định x + thay đổi y trước khi được coi là chim. */
        val lockFrames: Int = 6,
    )

    // ── Trạng thái theo thời gian ─────────────────────────────────────────────
    private var prev: Frame? = null
    private var frameIndex = 0L
    private var lastT = -1L
    private var currentRgb: IntArray = IntArray(0)

    private val scrollEstimator = ScrollEstimator(max(3, (p.maxShiftFrac * width).roundToInt()))
    private var scroll = 0.0
    private var scrollConf = 0.0
    private var scrollSeen = false

    /** Mô hình nền theo hàng (0xRRGGBB) và cờ đã học. */
    private val bg = IntArray(height)
    private val bgValid = BooleanArray(height)
    private val binCounts = IntArray(1 shl 15)
    private val binTouched = IntArray(256)

    private val borderRun = IntArray(width)
    private val lowEnd = IntArray(width)
    private val isBorderCol = BooleanArray(width)
    private val isPipeCol = BooleanArray(width)
    private val colMask = BooleanArray(width)

    /** Phiếu bầu cho mép đất theo hàng (chỉ số = hàng đầu tiên của đất; `height` = không có đất). */
    private val groundHist = DoubleArray(height + 1)
    /** Số cột có cạnh NGANG mạnh tại mỗi hàng — mép đất là một cạnh ngang chạy gần suốt bề rộng. */
    private val rowHEdge = IntArray(height)
    var groundY: Int = (p.defaultGroundFrac * height).roundToInt(); private set
    val groundLocked: Boolean get() = groundVotes >= p.groundMinVotes
    private var groundVotes = 0.0

    private class TrackedPipe(var left: Double, var right: Double, var gapTop: Double, var gapBottom: Double, var hits: Int, var missed: Int)
    private val tracked = ArrayList<TrackedPipe>()
    private var pipes: List<Pipe> = emptyList()

    // Mặt nạ chim + gán nhãn khối
    private val mask = BooleanArray(width * height)
    private val labels = IntArray(width * height)
    private val stack = IntArray(width * height)

    /** Trọng lực (px/s²) do bộ ước lượng vật lý cung cấp — dùng để dự đoán khi mất dấu chim. */
    var gravity: Double = 2.4 * height

    private class Candidate(var x: Double, var y: Double, var yMin: Double, var yMax: Double, var hits: Int, var lastFrame: Long)
    private val candidates = ArrayList<Candidate>()

    private var hasTrack = false
    private var trackX = 0.0
    private var trackY = 0.0
    private var trackVy = 0.0
    private var trackR = 0.0
    private var trackColor = 0
    private var trackMissed = 0
    private var trackHits = 0
    // Hai phép đo thô gần nhất (y, t) → vận tốc sai phân 2 khung, phản ứng ngay sau cú vỗ
    private var raw1Y = Double.NaN; private var raw1T = 0L
    private var raw2Y = Double.NaN; private var raw2T = 0L
    private var nowT = 0L

    val birdLocked: Boolean get() = hasTrack

    /** Thông tin gỡ lỗi của khung vừa xử lý (số khối, khối hợp lệ, khoảng cách tới dự đoán…). */
    var debug: String = ""; private set

    // Soi nội bộ cho test chẩn đoán
    fun debugBg(y: Int): Int = if (bgValid[y]) bg[y] else -1
    fun debugIsBorderCol(x: Int): Boolean = isBorderCol[x]
    fun debugIsPipeCol(x: Int): Boolean = isPipeCol[x]
    fun debugShift(): Int = scroll.roundToInt()
    fun debugIsForeground(c: Int, y: Int): Boolean = isForeground(c, y)

    private class Blob(
        val minX: Int, val maxX: Int, val minY: Int, val maxY: Int,
        val count: Int, val cx: Double, val cy: Double, val color: Int,
    )

    fun reset() {
        prev = null; frameIndex = 0; lastT = -1
        scroll = 0.0; scrollConf = 0.0; scrollSeen = false
        bgValid.fill(false)
        groundHist.fill(0.0); groundVotes = 0.0
        groundY = (p.defaultGroundFrac * height).roundToInt()
        tracked.clear(); pipes = emptyList()
        candidates.clear(); hasTrack = false; trackMissed = 0; trackHits = 0
        raw1Y = Double.NaN; raw2Y = Double.NaN
    }

    // ── Vòng xử lý chính ──────────────────────────────────────────────────────

    fun process(frame: Frame, tNanos: Long): Observation {
        require(frame.width == width && frame.height == height)
        currentRgb = frame.rgb
        val dt = if (lastT > 0) ((tNanos - lastT) / 1e9).coerceIn(1.0 / 240, 0.1) else 1.0 / 60
        lastT = tNanos
        nowT = tNanos
        val prevFrame = prev

        // 1. Biên dọc dài → cột biên ống + phiếu bầu mép đất
        computeBorderRuns(frame)
        updateGround(frame)

        // 2. Tốc độ cuộn — khớp quanh các biên ống; không có ống thì dùng dải đất, rồi cả khung
        if (prevFrame != null) estimateScroll(prevFrame, frame)
        val shiftInt = scroll.roundToInt()

        // 3. Mô hình nền theo hàng từ các cột không phải ống
        updateBackground(frame)

        // 4. Ống: ghép cặp biên, kiểm tra cột ở giữa so với nền, rồi theo dõi qua các khung
        pipes = trackPipes(findPipes(frame))
        isPipeCol.fill(false)
        for (pipe in pipes) for (x in max(0, pipe.left - 2)..min(width - 1, pipe.right + 2)) isPipeCol[x] = true

        // 5. Chim
        val bird = if (prevFrame != null) detectBird(frame, prevFrame, shiftInt, dt) else null

        prev = frame
        frameIndex++
        return Observation(frameIndex - 1, tNanos, width, height, scroll, scrollConf, groundY, bird, pipes)
    }

    // ── Bước 1: biên dọc + đất ──────────────────────────────────────────────

    private fun computeBorderRuns(frame: Frame) {
        val g = frame.gradX
        val minRun = (p.minBorderRunFrac * groundY).roundToInt()
        val voteMin = (p.groundVoteMinRunFrac * height).roundToInt()
        for (x in 0 until width) {
            var run = 0
            var gap = 0
            var longest = 0
            var low = -1
            for (y in 0 until height) {
                if (g[y * width + x] >= p.edgeThreshold) {
                    run += 1 + gap; gap = 0
                } else {
                    gap++
                    if (gap > 2) {
                        if (run >= minRun && run > longest) longest = run
                        if (run >= voteMin) low = y - gap + 1
                        run = 0; gap = 0
                    }
                }
            }
            if (run >= minRun && run > longest) longest = run
            if (run >= voteMin) low = height - gap
            borderRun[x] = longest
            isBorderCol[x] = longest >= minRun
            lowEnd[x] = low
        }
    }

    /**
     * Mép đất = hàng được nhiều biên ống dưới kết thúc nhất VÀ có cạnh ngang chạy gần suốt bề rộng
     * (vạch/đổi vân của đất). Điều kiện thứ hai loại trường hợp ống dưới quá ngắn khiến biên dài nhất
     * lại là ống trên — nó kết thúc ở khe, mà khe thì không có cạnh ngang suốt bề rộng.
     */
    private fun updateGround(frame: Frame) {
        for (i in groundHist.indices) groundHist[i] *= p.groundDecay
        val minY = height / 2
        for (x in 0 until width) {
            val e = lowEnd[x]
            if (e >= minY) groundHist[e] += 1.0
        }
        if (frameIndex % 5 != 0L) return

        val lum = frame.luma
        for (y in minY until height - 1) {
            var n = 0
            var x = 0
            while (x < width) { if (abs(lum[(y + 1) * width + x] - lum[(y - 1) * width + x]) >= p.edgeThreshold) n++; x += 2 }
            rowHEdge[y] = n * 2
        }
        val fullWidth = (0.5 * width).roundToInt()
        fun hasFullEdge(y: Int): Boolean {
            if (y >= height) return true // ống chạm đáy màn: không có đất
            for (k in max(minY, y - 2)..min(height - 2, y + 2)) if (rowHEdge[k] >= fullWidth) return true
            return false
        }

        var bestY = -1; var bestV = 0.0
        for (y in minY..height) {
            val v = groundHist[y] + (if (y > 0) groundHist[y - 1] else 0.0) + (if (y < height) groundHist[y + 1] else 0.0)
            if (v > bestV && hasFullEdge(y)) { bestV = v; bestY = y }
        }
        groundVotes = bestV
        if (bestY >= 0 && bestV >= p.groundMinVotes) groundY = bestY
    }

    // ── Bước 2: cuộn ────────────────────────────────────────────────────────

    private fun estimateScroll(prevFrame: Frame, frame: Frame) {
        var masked = 0
        colMask.fill(false)
        for (x in 0 until width) if (isBorderCol[x]) {
            for (k in max(0, x - 6)..min(width - 1, x + 6)) if (!colMask[k]) { colMask[k] = true; masked++ }
        }
        val est = when {
            masked >= 8 -> scrollEstimator.estimate(prevFrame, frame, 0, groundY, colMask)
            groundY < height - 4 -> scrollEstimator.estimate(prevFrame, frame, groundY, height, null)
            else -> scrollEstimator.estimate(prevFrame, frame, (0.06 * height).toInt(), height, null)
        }
        if (est.confidence > 0.15) {
            scroll = if (scrollSeen) 0.65 * scroll + 0.35 * est.shift else est.shift
            scrollSeen = true
        }
        scrollConf = est.confidence
    }

    // ── Bước 3: nền theo hàng ────────────────────────────────────────────────

    private fun updateBackground(frame: Frame) {
        val step = max(1, width / 60)
        for (y in 0 until height) {
            var touched = 0
            var x = 1
            while (x < width - 1) {
                if (!isBorderCol[x] && !isPipeCol[x]) {
                    val q = Frame.quantize(frame.rgb[y * width + x], 5)
                    if (binCounts[q] == 0) {
                        if (touched < binTouched.size) binTouched[touched++] = q else { x += step; continue }
                    }
                    binCounts[q]++
                }
                x += step
            }
            if (touched == 0) continue
            var bestQ = -1; var bestN = 0
            for (k in 0 until touched) {
                val q = binTouched[k]
                if (binCounts[q] > bestN) { bestN = binCounts[q]; bestQ = q }
                binCounts[q] = 0
            }
            if (bestQ < 0) continue
            val mode = Frame.dequantize(bestQ, 5)
            bg[y] = if (bgValid[y]) Frame.blend(bg[y], mode, 0.25) else mode
            bgValid[y] = true
        }
    }

    private fun isForeground(c: Int, y: Int): Boolean = !bgValid[y] || Frame.colorDistance(c, bg[y]) > p.bgTolerance

    // ── Bước 4: ống ─────────────────────────────────────────────────────────

    private fun findPipes(frame: Frame): List<Pipe> {
        // Gom các cột biên kề nhau thành một biên (khử răng cưa 1–2 px)
        val borders = ArrayList<Int>()
        var x = 0
        while (x < width) {
            if (isBorderCol[x]) {
                val start = x
                while (x + 1 < width && isBorderCol[x + 1]) x++
                borders.add((start + x) / 2)
            }
            x++
        }
        if (borders.size < 2) return emptyList()

        val minW = (p.minPipeWidthFrac * width).roundToInt()
        val maxW = (p.maxPipeWidthFrac * width).roundToInt()
        val out = ArrayList<Pipe>()
        var i = 0
        while (i < borders.size - 1) {
            var matched = false
            for (j in i + 1 until min(borders.size, i + 5)) {
                val w = borders[j] - borders[i]
                if (w < minW) continue
                if (w > maxW) break
                val pipe = validatePipe(frame, borders[i], borders[j]) ?: continue
                out.add(pipe)
                i = j + 1
                matched = true
                break
            }
            if (!matched) i++
        }
        return out
    }

    /** Kiểm tra cặp biên có phải một ống: cột giữa phải khác nền từ mép trên xuống khe và từ khe xuống đất. */
    private fun validatePipe(frame: Frame, left: Int, right: Int): Pipe? {
        val w = right - left
        val xs = intArrayOf(left + max(1, w / 4), left + w / 2, right - max(1, w / 4))
        val tops = IntArray(3); val bottoms = IntArray(3)
        var ok = 0
        for (k in xs.indices) {
            val r = columnGap(frame, xs[k]) ?: continue
            tops[ok] = r.first; bottoms[ok] = r.second; ok++
        }
        if (ok < 2) return null
        val t = tops.copyOf(ok).sorted(); val b = bottoms.copyOf(ok).sorted()
        val gapTop = t[ok / 2]; val gapBottom = b[ok / 2]
        val gap = gapBottom - gapTop
        if (gap < p.minGapFrac * height || gap > p.maxGapFrac * height) return null
        return Pipe(left, right, gapTop, gapBottom)
    }

    /**
     * Khe trống của một cột ống: (gapTop, gapBottom), hoặc null nếu cột không giống ống.
     * Ống trên = chuỗi khác-nền bám mép trên (chấp nhận thanh HUD ở trên), ống dưới = chuỗi khác-nền
     * bám mép đất (chấp nhận mép đất ước lượng lệch một chút). Lỗ ≤ 2 hàng bên trong chuỗi được bỏ qua.
     */
    private fun columnGap(frame: Frame, x: Int): Pair<Int, Int>? {
        val yEnd = groundY
        if (yEnd < 8) return null
        val rgb = frame.rgb
        // ống trên
        var y = 0
        val hudLimit = (p.hudSlackFrac * height).toInt()
        while (y < hudLimit && !isForeground(rgb[y * width + x], y)) y++
        if (y >= hudLimit) return null
        var lastFg = y
        var holes = 0
        while (y < yEnd) {
            if (isForeground(rgb[y * width + x], y)) { lastFg = y; holes = 0 } else { holes++; if (holes > 2) break }
            y++
        }
        val gapTop = lastFg + 1
        // ống dưới
        y = yEnd - 1
        val groundLimit = yEnd - 1 - (p.groundSlackFrac * height).toInt()
        while (y > groundLimit && !isForeground(rgb[y * width + x], y)) y--
        if (y <= groundLimit) return null
        var firstFg = y
        holes = 0
        while (y >= 0) {
            if (isForeground(rgb[y * width + x], y)) { firstFg = y; holes = 0 } else { holes++; if (holes > 2) break }
            y--
        }
        val gapBottom = firstFg
        if (gapTop >= gapBottom) return null
        val topRun = gapTop; val bottomRun = yEnd - gapBottom
        if (topRun < 2 || bottomRun < 2) return null
        if (topRun + bottomRun < 0.25 * yEnd) return null
        return gapTop to gapBottom
    }

    /** Theo dõi ống qua các khung: chỉ đưa ra ống đã thấy ≥ 2 lần, khe được làm mượt. */
    private fun trackPipes(detected: List<Pipe>): List<Pipe> {
        for (tp in tracked) { tp.left -= scroll; tp.right -= scroll }
        val used = BooleanArray(detected.size)
        val maxDx = max(3.0, 0.02 * width)
        val maxDy = 0.06 * height
        for (tp in tracked) {
            var best = -1; var bestD = Double.MAX_VALUE
            for (i in detected.indices) {
                if (used[i]) continue
                val d = detected[i]
                val dl = abs(d.left - tp.left); val dg = abs(d.gapTop - tp.gapTop)
                if (dl <= maxDx && dg <= maxDy && dl + dg < bestD) { bestD = dl + dg; best = i }
            }
            if (best >= 0) {
                used[best] = true
                val d = detected[best]
                tp.left = 0.5 * tp.left + 0.5 * d.left; tp.right = 0.5 * tp.right + 0.5 * d.right
                tp.gapTop = 0.6 * tp.gapTop + 0.4 * d.gapTop; tp.gapBottom = 0.6 * tp.gapBottom + 0.4 * d.gapBottom
                tp.hits++; tp.missed = 0
            } else tp.missed++
        }
        for (i in detected.indices) if (!used[i]) {
            val d = detected[i]
            tracked.add(TrackedPipe(d.left.toDouble(), d.right.toDouble(), d.gapTop.toDouble(), d.gapBottom.toDouble(), 1, 0))
        }
        tracked.removeAll { it.missed > 3 || it.right < -2 }
        return tracked.filter { it.hits >= 2 && it.missed <= 1 }
            .sortedBy { it.left }
            .map { Pipe(it.left.roundToInt(), it.right.roundToInt(), it.gapTop.roundToInt(), it.gapBottom.roundToInt()) }
    }

    // ── Bước 5: chim ────────────────────────────────────────────────────────

    private fun detectBird(frame: Frame, prevFrame: Frame, shiftInt: Int, dt: Double): Bird? {
        // Mặt nạ: khác nền VÀ không trùng với khung trước sau khi bù cuộn (⇒ không trôi theo màn).
        // So màu RGB chứ không so độ sáng: chim vàng trên nền trời sáng có độ sáng gần bằng nhau.
        val yEnd = groundY
        val rgb = frame.rgb; val prgb = prevFrame.rgb
        mask.fill(false, 0, width * yEnd)
        for (y in 0 until yEnd) {
            val row = y * width
            for (x in 0 until width) {
                if (isPipeCol[x] && isBorderCol[x]) continue
                val i = row + x
                if (!isForeground(rgb[i], y)) continue
                val xs = x + shiftInt
                val moved = if (xs in 0 until width) Frame.colorDistance(rgb[i], prgb[row + xs]) > p.motionThreshold else true
                if (moved) mask[i] = true
            }
        }
        val blobs = labelBlobs(yEnd)

        val minR = p.birdMinRadiusFrac * height
        val maxR = p.birdMaxRadiusFrac * height
        val minArea = 2.0 * minR * minR
        val maxArea = 4.0 * maxR * maxR * 1.2
        val valid = blobs.filter { b ->
            val bw = b.maxX - b.minX + 1; val bh = b.maxY - b.minY + 1
            val aspect = bw.toDouble() / bh
            b.count >= minArea && b.count <= maxArea && aspect in 0.35..3.0 && bw <= 2.4 * maxR && bh <= 2.4 * maxR
        }

        if (hasTrack) {
            // Dự đoán rồi cập nhật (bộ lọc alpha-beta với trọng lực)
            val predY = trackY + trackVy * dt + 0.5 * gravity * dt * dt
            val predVy = trackVy + gravity * dt
            val gate = max(p.trackGateFrac * height, 3 * trackR)
            var best: Blob? = null; var bestD = Double.MAX_VALUE
            for (b in valid) {
                val d = sqrt((b.cx - trackX) * (b.cx - trackX) + (b.cy - predY) * (b.cy - predY))
                if (d < bestD) { bestD = d; best = b }
            }
            var measX = Double.NaN; var measY = Double.NaN
            var how = "none"
            if (best != null && bestD <= gate) {
                // Khối chuyển động chỉ là MÉP DẪN ĐẦU của chim (điểm ảnh mới xuất hiện) nên trọng tâm của nó
                // lệch theo hướng bay; đo lại bằng trọng tâm các điểm màu chim quanh khối để không lệch.
                trackR = 0.8 * trackR + 0.2 * (max(best.maxX - best.minX, best.maxY - best.minY) + 1) / 2.0
                trackColor = Frame.blend(trackColor, best.color, 0.2)
                val refined = findByColor(frame, best.cx, best.cy)
                if (refined != null) { measX = refined.first; measY = refined.second; how = "blob+color" }
                else { measX = best.cx; measY = best.cy; how = "blob" }
            } else {
                // Chim đứng yên tạm thời (đỉnh cú vỗ) → tìm theo màu quanh vị trí dự đoán
                val m = findByColor(frame, trackX, predY)
                if (m != null) { measX = m.first; measY = m.second; how = "color" }
            }
            debug = "blobs=${blobs.size} valid=${valid.size} gateD=%.1f gate=%.1f how=$how pred=%.1f".format(bestD, gate, predY)
            if (!measY.isNaN()) {
                val resid = measY - predY
                trackY = predY + 0.7 * resid
                trackVy = predVy + (0.35 / dt) * resid
                trackX = 0.9 * trackX + 0.1 * measX
                trackMissed = 0; trackHits++
                // vận tốc từ phép đo thô: sai phân qua 2 khung (trễ 1 khung, không bị bộ lọc làm chậm sau cú vỗ)
                val vRaw = when {
                    !raw2Y.isNaN() && nowT > raw2T -> (measY - raw2Y) / ((nowT - raw2T) / 1e9)
                    !raw1Y.isNaN() && nowT > raw1T -> (measY - raw1Y) / ((nowT - raw1T) / 1e9)
                    else -> trackVy
                }
                raw2Y = raw1Y; raw2T = raw1T; raw1Y = measY; raw1T = nowT
                return Bird(trackX, trackY, measY, trackR, vRaw, coasting = false)
            }
            trackMissed++
            if (trackMissed > p.maxCoastFrames || predY > yEnd + trackR || predY < -trackR) { hasTrack = false; return null }
            trackY = predY; trackVy = predVy
            return Bird(trackX, trackY, Double.NaN, trackR, trackVy, coasting = true)
        }

        // Chưa khoá: theo dõi ứng viên — x ổn định, y thay đổi (mây trôi ngang có y cố định; điểm số thì bất động)
        val maxDx = max(1.5, 0.01 * width)
        val maxDy = 0.08 * height
        for (b in valid) {
            var c: Candidate? = null; var bestD = Double.MAX_VALUE
            for (cand in candidates) {
                val dx = abs(b.cx - cand.x); val dy = abs(b.cy - cand.y)
                if (dx <= maxDx && dy <= maxDy && dx + dy < bestD) { bestD = dx + dy; c = cand }
            }
            if (c == null) candidates.add(Candidate(b.cx, b.cy, b.cy, b.cy, 1, frameIndex))
            else {
                c.x = 0.7 * c.x + 0.3 * b.cx; c.y = b.cy
                c.yMin = min(c.yMin, b.cy); c.yMax = max(c.yMax, b.cy)
                c.hits++; c.lastFrame = frameIndex
            }
        }
        candidates.removeAll { frameIndex - it.lastFrame > 2 }
        debug = "shift=$shiftInt blobs=${blobs.size} valid=${valid.size} candidates=${candidates.size} best=${candidates.maxOfOrNull { it.hits } ?: 0} · " +
            blobs.sortedByDescending { it.count }.take(6).joinToString(" ") { "(%.0f,%.0f %dx%d n=%d%s)".format(it.cx, it.cy, it.maxX - it.minX + 1, it.maxY - it.minY + 1, it.count, if (it in valid) "✓" else "") }
        val locked = candidates.filter { it.hits >= p.lockFrames && it.yMax - it.yMin >= 1.5 && it.x < 0.7 * width }
            .maxByOrNull { it.hits }
        if (locked != null) {
            val b = valid.minByOrNull { abs(it.cx - locked.x) + abs(it.cy - locked.y) } ?: return null
            hasTrack = true
            trackR = (max(b.maxX - b.minX, b.maxY - b.minY) + 1) / 2.0
            trackColor = b.color
            val refined = findByColor(frame, b.cx, b.cy)
            val y0 = refined?.second ?: b.cy
            trackX = refined?.first ?: locked.x; trackY = y0; trackVy = 0.0
            trackMissed = 0; trackHits = 1
            raw1Y = y0; raw1T = nowT; raw2Y = Double.NaN
            candidates.clear()
            return Bird(trackX, trackY, y0, trackR, trackVy, coasting = false)
        }
        return null
    }

    /** Tìm chim theo màu đã học quanh (cx, cy). Trả về trọng tâm nếu đủ điểm khớp. */
    private fun findByColor(frame: Frame, cx: Double, cy: Double): Pair<Double, Double>? {
        val r = max(3.0, trackR * 2.0)
        val x0 = max(0, (cx - r).toInt()); val x1 = min(width - 1, (cx + r).toInt())
        val y0 = max(0, (cy - r).toInt()); val y1 = min(groundY - 1, (cy + r).toInt())
        var n = 0; var sx = 0.0; var sy = 0.0
        for (y in y0..y1) for (x in x0..x1) {
            val c = frame.rgb[y * width + x]
            if (Frame.colorDistance(c, trackColor) <= p.birdColorTolerance && isForeground(c, y)) { n++; sx += x; sy += y }
        }
        val expected = 2.0 * trackR * trackR
        return if (n >= 0.3 * expected) (sx / n) to (sy / n) else null
    }

    private fun labelBlobs(yEnd: Int): List<Blob> {
        labels.fill(0, 0, width * yEnd)
        val out = ArrayList<Blob>()
        var next = 1
        for (start in 0 until width * yEnd) {
            if (!mask[start] || labels[start] != 0) continue
            if (out.size >= 64) break
            var sp = 0
            stack[sp++] = start; labels[start] = next
            var minX = width; var maxX = -1; var minY = yEnd; var maxY = -1
            var count = 0; var sx = 0L; var sy = 0L; var sr = 0L; var sg = 0L; var sb = 0L
            while (sp > 0) {
                val i = stack[--sp]
                val x = i % width; val y = i / width
                count++; sx += x; sy += y
                val c = currentRgb[i]
                sr += Frame.r(c); sg += Frame.g(c); sb += Frame.b(c)
                if (x < minX) minX = x; if (x > maxX) maxX = x
                if (y < minY) minY = y; if (y > maxY) maxY = y
                for (dy in -1..1) {
                    val ny = y + dy
                    if (ny < 0 || ny >= yEnd) continue
                    for (dx in -1..1) {
                        val nx = x + dx
                        if (nx < 0 || nx >= width) continue
                        val j = ny * width + nx
                        if (mask[j] && labels[j] == 0) { labels[j] = next; stack[sp++] = j }
                    }
                }
            }
            out.add(Blob(minX, maxX, minY, maxY, count, sx.toDouble() / count, sy.toDouble() / count,
                Frame.pack((sr / count).toInt(), (sg / count).toInt(), (sb / count).toInt())))
            next++
        }
        return out
    }
}
