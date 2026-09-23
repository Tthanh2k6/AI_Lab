package ai.arena.core.sim

import ai.arena.core.vision.Frame
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.random.Random

/**
 * Mô phỏng Mr Gun nhiều skin: cầu thang, nhân vật đứng dưới, địch đứng cao hơn n bậc (trái/phải),
 * vạch ngắm lắc giữa hai góc (răng cưa hoặc hình sin), tap = bắn theo góc hiện tại. Trúng → chuyển cảnh
 * (địch ngã, camera trượt), trượt → chết. Boss cần nhiều phát, nhảy lên một bậc sau mỗi phát trúng thân.
 */
class MrGunSkin(
    val name: String,
    val bg: Int, val stairA: Int, val stairB: Int, val stairEdge: Int?,
    val playerColor: Int, val enemyColor: Int, val lineColor: Int,
    val lineDashed: Boolean,
    val omegaDegPerSec: Double,
    val sinusoidal: Boolean,
    val thetaMin: Double = -5.0, val thetaMax: Double = 85.0,
    val stepW: Int = 16, val stepH: Int = 20,
    val figureScale: Double = 1.0,
    val bossHp: Int = 1,
    val sideMode: String = "alternate", // alternate | random | right
    val hud: Boolean = true,
)

object MrGunSkins {
    val classic = MrGunSkin("classic", 0xF2EFE9, 0xD9D1C5, 0xCFC6B8, null, 0x2B2B2B, 0x2B2B2B, 0x2B2B2B, true, 90.0, false)
    val dark = MrGunSkin("dark", 0x1B1F2A, 0x2A3040, 0x323A4C, 0x4A5468, 0xE8E8E8, 0xFF6B6B, 0xFFD166, false, 120.0, false)
    val fast = MrGunSkin("fast", 0xEAF4F4, 0xC9E3E3, 0xBBD8D8, null, 0x223344, 0xD1495B, 0x223344, true, 140.0, true)
    val boss = MrGunSkin("boss", 0xF6F1E7, 0xE3D9C6, 0xD8CDB8, 0xB8AB94, 0x333333, 0x7A1E1E, 0x333333, true, 80.0, false, bossHp = 3, sideMode = "random")
    val small = MrGunSkin("small", 0xFFF8E7, 0xF0E2C3, 0xE6D6B2, null, 0x1F2A44, 0x1F2A44, 0x3355AA, false, 110.0, false, figureScale = 0.8, stepH = 24, sideMode = "right")
    val all = listOf(classic, dark, fast, boss, small)
}

class MrGunSim(val skin: MrGunSkin, val w: Int = 180, val h: Int = 320, seed: Long = 1) {
    private val rnd = Random(seed)
    val playerX = 0.5 * w
    val playerFeetY = 0.70 * h
    val s = skin.figureScale
    val headR = 4.5 * s

    var side = 1
    var steps = 2
    var enemyHp = skin.bossHp
    var kills = 0
    var headshots = 0
    var dead = false
    var frame = 0
    var transitionLeft = 0     // khung còn lại của chuyển cảnh (0 = đang chơi)
    private var enemyFallY = 0.0
    private var pan = 0.0
    private var phase = 0.0    // pha lắc
    private var thetaSide = skin.thetaMin
    val rgb = IntArray(w * h)

    init { newEnemy() }

    private fun newEnemy() {
        side = when (skin.sideMode) {
            "right" -> 1
            "random" -> if (rnd.nextBoolean()) 1 else -1
            else -> -side
        }
        // số bậc sao cho địch còn trong màn
        val maxSteps = ((if (side > 0) (0.92 * w - playerX) else (playerX - 0.08 * w)) / skin.stepW).toInt().coerceIn(1, 5)
        steps = 1 + rnd.nextInt(maxSteps)
        enemyHp = skin.bossHp
        phase = 0.0
        thetaSide = skin.thetaMin
    }

    // ── Hình học ──
    val enemyX: Double get() = playerX + side * steps * skin.stepW
    val enemyFeetY: Double get() = playerFeetY - steps * skin.stepH
    val pivotX: Double get() = playerX + side * 5 * s
    val pivotY: Double get() = playerFeetY - 17 * s
    val enemyHeadX: Double get() = enemyX
    val enemyHeadY: Double get() = enemyFeetY - 26 * s

    /** Góc vạch ngắm (độ, quy ước màn hình: 0° = phải, ngược chiều kim đồng hồ dương) ở khung `f`. */
    fun angleAtFrame(f: Int): Double {
        val t = f / 60.0
        val span = skin.thetaMax - skin.thetaMin
        val sideAngle = if (skin.sinusoidal) {
            // tốc độ góc đỉnh = omega: θ = mid + amp·sin(Ω t − π/2) với Ω = omega/amp (1/s)
            val mid = (skin.thetaMax + skin.thetaMin) / 2; val amp = span / 2
            mid + amp * sin(skin.omegaDegPerSec / amp * t - Math.PI / 2)
        } else {
            val period = 2 * span / skin.omegaDegPerSec
            val u = (t % period) / period
            skin.thetaMin + span * (if (u < 0.5) u * 2 else 2 - u * 2)
        }
        return if (side > 0) sideAngle else 180 - sideAngle
    }

    private var engagementStart = 0
    val angleNow: Double get() = angleAtFrame(frame - engagementStart)

    /** Mô phỏng một cú bắn theo góc hiện tại: "head" / "body" / "miss". */
    fun shoot(): String {
        val a = Math.toRadians(angleNow)
        val dx = cos(a); val dy = -sin(a)
        // đầu
        val hx = enemyHeadX - pivotX; val hy = enemyHeadY - pivotY
        val tHead = hx * dx + hy * dy
        if (tHead > 0) {
            val perp = abs(hx * dy - hy * dx)
            if (perp <= headR) return "head"
        }
        // thân (khung: thân + chân)
        val bx0 = enemyX - 3.5 * s; val bx1 = enemyX + 3.5 * s
        val by0 = enemyFeetY - 26 * s; val by1 = enemyFeetY   // thân nối liền lên tâm đầu (đầu game là ô vuông đặt trên thân, không có khe)
        var r = 1.0
        while (r < 1.2 * h) {
            val x = pivotX + r * dx; val y = pivotY + r * dy
            if (x in bx0..bx1 && y in by0..by1) return "body"
            if (x < 0 || x >= w || y < 0 || y >= h) break
            r += 1.0
        }
        return "miss"
    }

    /** Tiến một khung; `tap` = lệnh bắn có hiệu lực ở khung này. */
    fun step(tap: Boolean) {
        if (dead) { frame++; return }
        if (transitionLeft > 0) {
            transitionLeft--
            if (transitionLeft >= 12) enemyFallY += 2.5 else pan = (12 - transitionLeft) / 12.0 * steps * skin.stepH
            if (transitionLeft == 0) { pan = 0.0; enemyFallY = 0.0; newEnemy(); engagementStart = frame + 1 }
            frame++
            return
        }
        if (tap) {
            when (shoot()) {
                "head" -> { enemyHp -= 2; headshots++ }
                "body" -> enemyHp -= 1
                else -> { dead = true; frame++; return }
            }
            if (enemyHp <= 0) { kills++; transitionLeft = 24 }
            else { steps = (steps + 1).coerceAtMost(5); engagementStart = frame + 1 } // boss nhảy lên một bậc
        }
        frame++
    }

    /** Chính sách "biết hết": bắn khi góc sau `latencyFrames` khung nằm trong dải đầu (hoặc thân nếu đầu quá hẹp). */
    fun oracleTap(latencyFrames: Int): Boolean {
        if (dead || transitionLeft > 0) return false
        val future = angleAtFrame(frame - engagementStart + latencyFrames)
        val headAng = Math.toDegrees(kotlin.math.atan2(pivotY - enemyHeadY, enemyHeadX - pivotX))
        val dist = sqrt((enemyHeadX - pivotX) * (enemyHeadX - pivotX) + (enemyHeadY - pivotY) * (enemyHeadY - pivotY))
        val headHalf = Math.toDegrees(kotlin.math.atan(headR / dist))
        return abs(future - headAng) <= headHalf * 0.6
    }

    fun render(): Frame {
        rgb.fill(skin.bg)
        val panI = pan.roundToInt()
        // cầu thang: từ dưới lên về phía địch, nối tiếp thêm vài bậc
        val stepsToDraw = 8
        for (k in -2..stepsToDraw) {
            val topY = (playerFeetY - k * skin.stepH).roundToInt() + panI
            val x0 = if (side > 0) (playerX + (k - 0.5) * skin.stepW).roundToInt() else 0
            val x1 = if (side > 0) w else (playerX - (k - 0.5) * skin.stepW).roundToInt()
            rect(x0, topY, x1 - x0, skin.stepH, if (k % 2 == 0) skin.stairA else skin.stairB)
            skin.stairEdge?.let { hline(x0, x1, topY, it) }
        }
        // địch (ngã xuống khi chuyển cảnh)
        if (transitionLeft == 0 || transitionLeft >= 12) figure(enemyX, enemyFeetY + enemyFallY + panI, -side, skin.enemyColor)
        // nhân vật
        figure(playerX, playerFeetY + panI, side, skin.playerColor)
        // vạch ngắm (ẩn khi chuyển cảnh)
        if (transitionLeft == 0 && !dead) {
            val a = Math.toRadians(angleNow)
            val len = (0.5 * h).toInt()
            for (r in (6 * s).toInt()..len) {
                if (skin.lineDashed && (r / 4) % 2 == 1) continue
                val x = (pivotX + r * cos(a)).roundToInt(); val y = (pivotY - r * sin(a)).roundToInt() + panI
                plot(x, y, skin.lineColor); plot(x + 1, y, skin.lineColor)
            }
        }
        if (skin.hud) drawScore()
        return Frame(w, h, rgb.copyOf())
    }

    private fun figure(x: Double, feet: Double, facing: Int, c: Int) {
        val hr = headR
        ellipse(x, feet - 26 * s, hr, hr, c)
        rect((x - 3.5 * s).roundToInt(), (feet - 21 * s).roundToInt(), (7 * s).roundToInt().coerceAtLeast(3), (13 * s).roundToInt(), c)
        rect((x - 3 * s).roundToInt(), (feet - 8 * s).roundToInt(), (2 * s).roundToInt().coerceAtLeast(1), (8 * s).roundToInt(), c)
        rect((x + 1 * s).roundToInt(), (feet - 8 * s).roundToInt(), (2 * s).roundToInt().coerceAtLeast(1), (8 * s).roundToInt(), c)
        // tay cầm súng hướng về phía đối thủ
        val armX = if (facing > 0) x else x - 6 * s
        rect(armX.roundToInt(), (feet - 18 * s).roundToInt(), (6 * s).roundToInt(), (2 * s).roundToInt().coerceAtLeast(1), c)
    }

    private fun drawScore() {
        val str = kills.toString()
        val scale = 2
        var x0 = w / 2 - (str.length * 4 * scale - scale) / 2
        val y0 = (0.03 * h).toInt()
        for (ch in str) {
            val rows = FlappySim.DIGITS[ch - '0']
            for (r in 0 until 5) for (cc in 0 until 3) if (rows[r] and (1 shl (2 - cc)) != 0) rect(x0 + cc * scale, y0 + r * scale, scale, scale, skin.playerColor)
            x0 += 4 * scale
        }
    }

    private fun plot(x: Int, y: Int, c: Int) { if (x in 0 until w && y in 0 until h) rgb[y * w + x] = c }
    private fun rect(x: Int, y: Int, rw: Int, rh: Int, c: Int) {
        val x0 = x.coerceAtLeast(0); val x1 = (x + rw).coerceAtMost(w)
        val y0 = y.coerceAtLeast(0); val y1 = (y + rh).coerceAtMost(h)
        for (yy in y0 until y1) for (xx in x0 until x1) rgb[yy * w + xx] = c
    }
    private fun hline(x0: Int, x1: Int, y: Int, c: Int) { if (y in 0 until h) for (x in x0.coerceAtLeast(0) until x1.coerceAtMost(w)) rgb[y * w + x] = c }
    private fun ellipse(cx: Double, cy: Double, rx: Double, ry: Double, c: Int) {
        for (y in (cy - ry).toInt()..(cy + ry).toInt()) for (x in (cx - rx).toInt()..(cx + rx).toInt()) {
            if (x !in 0 until w || y !in 0 until h) continue
            val dx = (x - cx) / rx; val dy = (y - cy) / ry
            if (dx * dx + dy * dy <= 1.0) rgb[y * w + x] = c
        }
    }
}
