package ai.arena.core.sim

import ai.arena.core.vision.Frame
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.random.Random

/**
 * Mô phỏng Flappy Bird "nhiều skin" để test lõi mà không cần điện thoại: mỗi skin có màu, bề rộng ống,
 * khe, trọng lực, lực vỗ, nền (mây / thành phố parallax) khác nhau — giống sự khác biệt giữa các bản clone.
 */
class Skin(
    val name: String,
    val skyTop: Int, val skyBottom: Int,
    val groundStripeA: Int, val groundStripeB: Int, val groundDirt: Int,
    val pipeBody: Int, val pipeLight: Int, val pipeOutline: Int,
    val birdBody: Int, val birdWing: Int,
    val clouds: Boolean = true, val cloudColor: Int = 0xF4F8FF,
    val city: Boolean = false, val cityColor: Int = 0xC9DCE6,
    val pipeWidthFrac: Double = 0.12, val capExtra: Int = 2, val capHeightFrac: Double = 0.035,
    val gapFrac: Double = 0.26, val spacingFrac: Double = 0.55, val groundFrac: Double = 0.13,
    val scrollPxPerFrame: Double = 2.2, val gravity: Double = 0.30, val flapVy: Double = -4.9,
    val terminalVy: Double = 8.0,
    val birdRadiusFrac: Double = 0.026, val birdXFrac: Double = 0.28,
    val hudScore: Boolean = true,
)

object Skins {
    val classic = Skin("classic", 0x4EC0CA, 0x9BE7EC, 0x73BF2E, 0x5A9E23, 0xDED895, 0x74C948, 0xA3E85F, 0x23491A, 0xF8D648, 0xF0A020)
    val night = Skin("night", 0x0B1A3A, 0x2A4A7A, 0x3B6B3B, 0x2F572F, 0x5A4632, 0x3C8F5F, 0x5FBF7F, 0x123A22, 0xFF7A18, 0xD05A10, clouds = false, city = true, cityColor = 0x1F3557, gravity = 0.24, flapVy = -4.2, scrollPxPerFrame = 1.8)
    val red = Skin("red", 0xB7E4F7, 0xE8F6FB, 0xB98C4A, 0x9A7038, 0xE0C890, 0xC0392B, 0xE74C3C, 0x6E1B12, 0x3498DB, 0x2471A3, pipeWidthFrac = 0.16, gapFrac = 0.30, scrollPxPerFrame = 2.8, gravity = 0.36, flapVy = -5.6)
    val tight = Skin("tight", 0x6DD5ED, 0xB0EAF5, 0x8BC34A, 0x689F38, 0xD7CCC8, 0x2E7D32, 0x43A047, 0x1B3A1E, 0xFFEB3B, 0xF9A825, gapFrac = 0.20, spacingFrac = 0.48, scrollPxPerFrame = 2.0, gravity = 0.26, flapVy = -4.1, birdRadiusFrac = 0.022)
    val noGround = Skin("noground", 0x87CEEB, 0xB0E0F0, 0x87CEEB, 0x87CEEB, 0x87CEEB, 0x5B8C3A, 0x7BB454, 0x2B4A1A, 0xE53935, 0xB71C1C, groundFrac = 0.0, clouds = true, city = true, gravity = 0.32, flapVy = -5.0, scrollPxPerFrame = 2.4)
    val all = listOf(classic, night, red, tight, noGround)
}

class SimPipe(var x: Double, val gapTop: Double, var scored: Boolean = false)

class FlappySim(val skin: Skin, val w: Int = 180, val h: Int = 320, seed: Long = 1) {
    private val rnd = Random(seed)
    val groundY: Int = h - (skin.groundFrac * h).roundToInt()
    val pipeW: Int = (skin.pipeWidthFrac * w).roundToInt()
    val gap: Int = (skin.gapFrac * h).roundToInt()
    val capH: Int = (skin.capHeightFrac * h).roundToInt().coerceAtLeast(2)
    val birdR: Double = skin.birdRadiusFrac * h
    val birdX: Double = skin.birdXFrac * w

    var birdY: Double = 0.48 * h
    var birdVy: Double = 0.0
    var frame = 0
    var score = 0
    var dead = false
    var started = false
    val pipes = ArrayDeque<SimPipe>()
    private var scrollPos = 0.0

    val rgb = IntArray(w * h)

    /** Tiến một khung hình. `flap` = cú vỗ có hiệu lực ở khung này. */
    fun step(flap: Boolean) {
        if (dead) { frame++; return }
        if (flap) started = true
        if (started) {
            if (flap) birdVy = skin.flapVy
            birdVy += skin.gravity
            if (birdVy > skin.terminalVy) birdVy = skin.terminalVy
            birdY += birdVy
            if (birdY - birdR < 0) { birdY = birdR; birdVy = 0.0 }
            scrollPos += skin.scrollPxPerFrame
            for (p in pipes) p.x -= skin.scrollPxPerFrame
            val spacing = skin.spacingFrac * w
            if (pipes.isEmpty() || pipes.last().x < w - spacing) {
                val minTop = 0.10 * h
                val maxTop = groundY - 0.10 * h - gap
                pipes.addLast(SimPipe(w + pipeW.toDouble(), minTop + rnd.nextDouble() * (maxTop - minTop)))
            }
            while (pipes.isNotEmpty() && pipes.first().x + pipeW + 4 < 0) pipes.removeFirst()
            for (p in pipes) if (!p.scored && p.x + pipeW < birdX - birdR) { p.scored = true; score++ }
            // va chạm
            val rr = birdR * 0.9
            if (birdY + rr > groundY) dead = true
            for (p in pipes) {
                if (birdX + rr > p.x && birdX - rr < p.x + pipeW) {
                    if (birdY - rr < p.gapTop || birdY + rr > p.gapTop + gap) dead = true
                }
            }
        } else {
            // màn "sẵn sàng": chim nhấp nhô, đất vẫn cuộn
            birdY = 0.48 * h + 3 * sin(frame * 0.15)
            scrollPos += skin.scrollPxPerFrame
        }
        frame++
    }

    val nextPipe: SimPipe? get() = pipes.firstOrNull { it.x + pipeW > birdX - birdR }

    /** Chính sách "biết hết" dùng cho các test nhận diện: bay quanh tâm khe. */
    fun oracleFlap(): Boolean {
        val np = nextPipe
        val target = if (np != null) np.gapTop + gap * 0.6 else 0.45 * groundY
        return birdY > target && birdVy > -1.5
    }

    fun render(): Frame {
        // trời
        for (y in 0 until h) {
            val c = Frame.blend(skin.skyTop, skin.skyBottom, y.toDouble() / h)
            val row = y * w
            for (x in 0 until w) rgb[row + x] = c
        }
        // mây (parallax 0.35)
        if (skin.clouds) {
            val off = (scrollPos * 0.35)
            for (k in 0 until 3) {
                val cx = (((k * 73 + 20) - off) % (w + 60) + (w + 60)) % (w + 60) - 30
                val cy = 0.12 * h + k * 0.11 * h
                ellipse(cx, cy, 14.0, 5.0, skin.cloudColor)
                ellipse(cx + 9, cy - 2, 8.0, 5.0, skin.cloudColor)
            }
        }
        // thành phố (parallax 0.6)
        if (skin.city) {
            val off = scrollPos * 0.6
            val baseY = if (skin.groundFrac > 0) groundY else (0.85 * h).toInt()
            for (k in 0 until 9) {
                val bx = ((((k * 31) - off) % (w + 40)) + (w + 40)) % (w + 40) - 20
                val bh = 14 + (k * 7) % 22
                rect(bx.toInt(), baseY - bh, 12, bh, skin.cityColor)
            }
        }
        // ống
        for (p in pipes) {
            val px = p.x.roundToInt()
            val gt = p.gapTop.roundToInt()
            val gb = gt + gap
            rect(px, 0, pipeW, gt - capH, skin.pipeBody)
            rect(px - skin.capExtra, gt - capH, pipeW + 2 * skin.capExtra, capH, skin.pipeBody)
            rect(px, gb + capH, pipeW, groundY - gb - capH, skin.pipeBody)
            rect(px - skin.capExtra, gb, pipeW + 2 * skin.capExtra, capH, skin.pipeBody)
            rect(px + 2, 0, 2, gt - capH, skin.pipeLight)
            rect(px + 2, gb + capH, 2, groundY - gb - capH, skin.pipeLight)
            // viền
            vline(px - skin.capExtra, gt - capH, gt, skin.pipeOutline); vline(px + pipeW + skin.capExtra - 1, gt - capH, gt, skin.pipeOutline)
            vline(px - skin.capExtra, gb, gb + capH, skin.pipeOutline); vline(px + pipeW + skin.capExtra - 1, gb, gb + capH, skin.pipeOutline)
            vline(px, 0, gt - capH, skin.pipeOutline); vline(px + pipeW - 1, 0, gt - capH, skin.pipeOutline)
            vline(px, gb + capH, groundY, skin.pipeOutline); vline(px + pipeW - 1, gb + capH, groundY, skin.pipeOutline)
            hline(px - skin.capExtra, px + pipeW + skin.capExtra, gt - 1, skin.pipeOutline)
            hline(px - skin.capExtra, px + pipeW + skin.capExtra, gb, skin.pipeOutline)
        }
        // đất
        if (skin.groundFrac > 0) {
            val stripeH = ((h - groundY) * 0.3).roundToInt().coerceAtLeast(2)
            val off = scrollPos.roundToInt()
            for (y in groundY until groundY + stripeH) for (x in 0 until w) {
                rgb[y * w + x] = if (((x + off) / 6) % 2 == 0) skin.groundStripeA else skin.groundStripeB
            }
            rect(0, groundY + stripeH, w, h - groundY - stripeH, skin.groundDirt)
            hline(0, w, groundY, skin.pipeOutline)
        }
        // chim
        ellipse(birdX, birdY, birdR, birdR * 0.85, skin.birdBody)
        val wingUp = (frame / 4) % 2 == 0
        rect((birdX - birdR * 0.6).toInt(), (birdY + (if (wingUp) -0.35 else 0.15) * birdR).toInt(), (birdR * 0.9).toInt().coerceAtLeast(2), (birdR * 0.45).toInt().coerceAtLeast(1), skin.birdWing)
        rect((birdX + birdR * 0.35).toInt(), (birdY - birdR * 0.45).toInt(), 2, 2, 0xFFFFFF)
        rect((birdX + birdR * 0.5).toInt(), (birdY - birdR * 0.4).toInt(), 1, 1, 0x000000)
        // điểm số
        if (skin.hudScore) drawScore()
        return Frame(w, h, rgb.copyOf())
    }

    private fun drawScore() {
        val s = score.toString()
        val scale = 2
        val totalW = s.length * 4 * scale - scale
        var x0 = w / 2 - totalW / 2
        val y0 = (0.04 * h).toInt()
        for (ch in s) {
            val rows = DIGITS[ch - '0']
            for (r in 0 until 5) for (c in 0 until 3) {
                if (rows[r] and (1 shl (2 - c)) != 0) {
                    rect(x0 + c * scale + 1, y0 + r * scale + 1, scale, scale, 0x202020)
                    rect(x0 + c * scale, y0 + r * scale, scale, scale, 0xFFFFFF)
                }
            }
            x0 += 4 * scale
        }
    }

    private fun rect(x: Int, y: Int, rw: Int, rh: Int, c: Int) {
        val x0 = x.coerceAtLeast(0); val x1 = (x + rw).coerceAtMost(w)
        val y0 = y.coerceAtLeast(0); val y1 = (y + rh).coerceAtMost(h)
        for (yy in y0 until y1) for (xx in x0 until x1) rgb[yy * w + xx] = c
    }
    private fun vline(x: Int, y0: Int, y1: Int, c: Int) { if (x in 0 until w) for (y in y0.coerceAtLeast(0) until y1.coerceAtMost(h)) rgb[y * w + x] = c }
    private fun hline(x0: Int, x1: Int, y: Int, c: Int) { if (y in 0 until h) for (x in x0.coerceAtLeast(0) until x1.coerceAtMost(w)) rgb[y * w + x] = c }
    private fun ellipse(cx: Double, cy: Double, rx: Double, ry: Double, c: Int) {
        for (y in (cy - ry).toInt()..(cy + ry).toInt()) for (x in (cx - rx).toInt()..(cx + rx).toInt()) {
            if (x !in 0 until w || y !in 0 until h) continue
            val dx = (x - cx) / rx; val dy = (y - cy) / ry
            if (dx * dx + dy * dy <= 1.0) rgb[y * w + x] = c
        }
    }

    companion object {
        val DIGITS = arrayOf(
            intArrayOf(0b111, 0b101, 0b101, 0b101, 0b111), intArrayOf(0b010, 0b110, 0b010, 0b010, 0b111),
            intArrayOf(0b111, 0b001, 0b111, 0b100, 0b111), intArrayOf(0b111, 0b001, 0b111, 0b001, 0b111),
            intArrayOf(0b101, 0b101, 0b111, 0b001, 0b001), intArrayOf(0b111, 0b100, 0b111, 0b001, 0b111),
            intArrayOf(0b111, 0b100, 0b111, 0b101, 0b111), intArrayOf(0b111, 0b001, 0b010, 0b010, 0b010),
            intArrayOf(0b111, 0b101, 0b111, 0b101, 0b111), intArrayOf(0b111, 0b101, 0b111, 0b001, 0b111),
        )
        const val FRAME_NANOS = 16_666_667L
        @Suppress("unused") fun approx(a: Double, b: Double, tol: Double) = abs(a - b) <= tol
    }
}
