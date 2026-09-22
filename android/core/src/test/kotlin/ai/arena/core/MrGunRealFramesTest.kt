package ai.arena.core

import ai.arena.core.agent.MrGunAgent
import ai.arena.core.vision.Frame
import ai.arena.core.vision.MrGunDetector
import ai.arena.core.vision.MrGunObservation
import java.io.File
import javax.imageio.ImageIO
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Chạy tác nhân Mr Gun trên khung hình THẬT (PNG đã thu nhỏ về cỡ chụp của app, 202×440).
 *
 * - Mặc định: 40 khung liên tiếp ghi từ Mr Gun (Ketchapp) trên Xiaomi 17 Pro, level 18, trong
 *   `src/test/resources/mrgun_real/` — có assert (tâm xoay, góc, địch, một quyết định bắn, không có
 *   nút chơi lại giả), và màn thua `mrgun_gameover.png` (nút chơi lại phải được nhận ra đúng chỗ).
 * - Đặt biến môi trường MRGUN_FRAMES=<thư mục png> (và MRGUN_FPS, MRGUN_VERBOSE) để chạy trên
 *   một đoạn ghi hình khác: chỉ in vết, không assert. Nhớ `gradlew :core:test --rerun` vì Gradle
 *   không coi biến môi trường là input.
 */
class MrGunRealFramesTest {

    private class Stats(var frames: Int = 0, var pivot: Int = 0, var angle: Int = 0, var enemy: Int = 0, var fires: Int = 0, var restart: Int = 0)

    private fun load(f: File): Frame {
        val img = ImageIO.read(f)
        val w = img.width; val h = img.height
        val rgb = IntArray(w * h)
        img.getRGB(0, 0, w, h, rgb, 0, w)
        for (k in rgb.indices) { val c = rgb[k]; rgb[k] = Frame.pack((c shr 16) and 255, (c shr 8) and 255, c and 255) }
        return Frame(w, h, rgb)
    }

    private fun run(files: List<File>, fps: Double, verbose: Boolean, warmup: Int): Stats {
        val st = Stats()
        var agent: MrGunAgent? = null
        for ((i, f) in files.withIndex()) {
            val frame = load(f)
            val a = agent ?: MrGunAgent(frame.width, frame.height).also { agent = it }
            val out = a.onFrame(frame, (i * 1e9 / fps).toLong())
            val o = out.observation
            if (i >= warmup) {
                st.frames++
                if (o.pivotValid) st.pivot++
                if (!o.angleDeg.isNaN()) st.angle++
                if (o.enemy != null) st.enemy++
                if (out.tap && out.reason.startsWith("fire")) st.fires++
            }
            if (!o.restartX.isNaN() || o.startScreen || !o.declineX.isNaN()) st.restart++
            if (verbose || out.tap || i == files.size - 1) {
                println("%4d %-12s | pivot=(%.0f,%.0f%s) θ=%.1f ω=%.0f sweep=[%.0f,%.0f] enemy=%s restart=(%.0f,%.0f) | %s %s | %s".format(
                    i, f.name, o.pivotX, o.pivotY, if (o.pivotValid) "" else "?", o.angleDeg, o.angularVelDegPerSec,
                    o.sweepMinDeg, o.sweepMaxDeg,
                    o.enemy?.let { "x=%d..%d y=%d..%d head=(%.0f,%.0f r=%.1f)".format(it.minX, it.maxX, it.minY, it.maxY, it.headX, it.headY, it.headR) } ?: "--",
                    o.restartX, o.restartY, if (out.tap) "TAP" else "   ", out.reason, out.detail))
            }
        }
        val a = agent ?: return st
        if (verbose) printMap(a)
        return st
    }

    /** Bản đồ ASCII của khung cuối: '#' = tiền cảnh tĩnh, '~' = đang chuyển động, '|' = vùng che vạch ngắm. */
    private fun printMap(a: MrGunAgent) {
        val w = a.width; val h = a.height
        val sx = 3; val sy = 6
        println("map ${w}x$h (1 ký tự = ${sx}x$sy px)")
        for (y in 0 until h step sy) {
            val sb = StringBuilder()
            for (x in 0 until w step sx) {
                var fgc = 0; var mvc = 0; var lc = 0; var n = 0
                for (yy in y until minOf(h, y + sy)) for (xx in x until minOf(w, x + sx)) {
                    n++
                    if (a.detector.debugForeground(xx, yy)) fgc++
                    if (a.detector.debugMoving(xx, yy)) mvc++
                    if (a.detector.debugLineMask(xx, yy)) lc++
                }
                sb.append(when {
                    mvc * 2 >= n -> '~'
                    fgc * 2 >= n -> '#'
                    lc * 2 >= n -> '|'
                    fgc > 0 || mvc > 0 -> '.'
                    else -> ' '
                })
            }
            println("%3d %s".format(y, sb))
        }
    }

    @Test
    fun realFramesFromXiaomi17Pro() {
        val dir = File(javaClass.getResource("/mrgun_real")!!.toURI())
        val files = dir.listFiles { f -> f.name.endsWith(".png") }!!.sortedBy { it.name }
        val st = run(files, 60.0, verbose = false, warmup = 12)
        println("real fixture: frames ${st.frames} pivot ${st.pivot} angle ${st.angle} enemy ${st.enemy} fires ${st.fires} restart ${st.restart}")
        assertTrue(st.pivot >= 0.9 * st.frames, "pivot ${st.pivot}/${st.frames}")
        assertTrue(st.angle >= 0.9 * st.frames, "angle ${st.angle}/${st.frames}")
        assertTrue(st.enemy >= 0.9 * st.frames, "enemy ${st.enemy}/${st.frames}")
        assertTrue(st.fires >= 1, "expected at least one fire decision while the line sweeps across the enemy")
        assertEquals(0, st.restart, "no restart button / start screen must be reported during play")
    }

    private fun still(resource: String): Pair<Frame, MrGunObservation> {
        val frame = load(File(javaClass.getResource(resource)!!.toURI()))
        val det = MrGunDetector(frame.width, frame.height)
        var obs: MrGunObservation? = null
        for (i in 0 until 20) obs = det.process(frame, i * 16_666_667L)
        val o = obs!!
        println("$resource: restart=(%.0f,%.0f) start=%s angle=%.1f enemy=%s | %s".format(o.restartX, o.restartY, o.startScreen, o.angleDeg, o.enemy, det.debug))
        return frame to o
    }

    @Test
    fun restartButtonFoundOnGameOverScreen() {
        val (frame, o) = still("/mrgun_gameover.png")
        assertTrue(!o.restartX.isNaN(), "restart button not found")
        assertTrue(!o.startScreen && o.declineX.isNaN(), "game-over screen must not look like the start screen or revive menu")
        val fx = o.restartX / frame.width; val fy = o.restartY / frame.height
        assertTrue(abs(fx - 0.53) < 0.06 && abs(fy - 0.78) < 0.05, "restart at (%.2f, %.2f) of screen".format(fx, fy))
    }

    /**
     * Menu hồi sinh dựng theo bố cục prefab (ReviveMenu, canvas 946×2048 khớp theo chiều cao): nền tối,
     * chữ "CONTINUE?" ở 30 % từ trên, nút xem quảng cáo (khung viền, 460×151) ở 70 %, NO THANKS (384×120) ở ≈81 %.
     */
    @Test
    fun reviveMenuDeclineButtonIsTheLowerFrame() {
        val w = 202; val h = 440
        val rgb = IntArray(w * h) { Frame.pack(18, 20, 14) }
        fun frameRect(cx: Double, cy: Double, rw: Double, rh: Double, color: Int) {
            val x0 = (cx - rw / 2).toInt(); val x1 = (cx + rw / 2).toInt(); val y0 = (cy - rh / 2).toInt(); val y1 = (cy + rh / 2).toInt()
            for (y in y0..y1) for (x in x0..x1) if (x - x0 < 2 || x1 - x < 2 || y - y0 < 2 || y1 - y < 2) rgb[y * w + x] = color
        }
        fun text(cx: Double, cy: Double, tw: Double, color: Int) {
            val x0 = (cx - tw / 2).toInt(); val x1 = (cx + tw / 2).toInt(); val yy = cy.toInt()
            for (x in x0..x1 step 3) for (y in yy - 2..yy + 2) rgb[y * w + x] = color
        }
        val sx = h / 2048.0
        text(w / 2.0, 0.30 * h, 300 * sx, Frame.pack(255, 255, 255))                       // CONTINUE?
        frameRect(w / 2.0, 0.70 * h, 460 * sx, 151 * sx, Frame.pack(90, 220, 240))          // continue (ad)
        text(w / 2.0, 0.70 * h, 200 * sx, Frame.pack(255, 255, 255))
        frameRect(w / 2.0, 0.70 * h + 226 * sx, 384 * sx, 120 * sx, Frame.pack(170, 170, 170)) // NO THANKS
        text(w / 2.0, 0.70 * h + 226 * sx, 160 * sx, Frame.pack(170, 170, 170))
        val frame = Frame(w, h, rgb)
        val det = MrGunDetector(w, h)
        var obs: MrGunObservation? = null
        for (i in 0 until 20) obs = det.process(frame, i * 16_666_667L)
        val o = obs!!
        println("revive: decline=(%.0f,%.0f) restart=(%.0f,%.0f) start=%s | %s".format(o.declineX, o.declineY, o.restartX, o.restartY, o.startScreen, det.debug))
        assertTrue(!o.declineX.isNaN(), "NO THANKS not found")
        assertTrue(o.restartX.isNaN() && !o.startScreen, "revive menu must not look like fail menu or start screen")
        assertTrue(abs(o.declineX / w - 0.5) < 0.04 && abs(o.declineY / h - 0.81) < 0.04, "decline at (%.2f, %.2f)".format(o.declineX / w, o.declineY / h))
    }

    /**
     * Level 22 thật: địch LONG (đầu trắng nhỏ, thân xanh lá cao gầy) cầm súng lục màu xám trùng màu nền,
     * khẩu súng cắt ngang thân → hai mảnh phải được gộp lại. Tâm xoay ép ở vị trí đo được trên máy (36,264).
     */
    @Test
    fun longEnemySplitByGreyGunIsStillFound() {
        val frame = load(File(javaClass.getResource("/mrgun_level22.png")!!.toURI()))
        val det = MrGunDetector(frame.width, frame.height)
        repeat(3) { det.process(frame, it * 16_666_667L) }
        det.debugForcePivot(36.0, 264.0)
        val o = det.process(frame, 3 * 16_666_667L)
        println("level22: enemy=${o.enemy} blobs=${det.debugBlobs().joinToString { "x=${it[0]}..${it[1]} y=${it[2]}..${it[3]} n=${it[4]}" }}")
        val e = o.enemy
        assertTrue(e != null, "LONG enemy not found")
        assertTrue(e!!.minY <= 220 && e.maxY >= 240 && e.minX >= 140 && e.maxX <= 162, "enemy box x=${e.minX}..${e.maxX} y=${e.minY}..${e.maxY}")
        assertTrue(abs(e.headX - 151) <= 3 && abs(e.headY - 222) <= 4, "head at (${e.headX}, ${e.headY})")
    }

    @Test
    fun startScreenRecognisedWithoutTappingItsButtons() {
        val (_, o) = still("/mrgun_start.png")
        assertTrue(o.startScreen, "start screen (row of 4 framed buttons) not recognised")
        assertTrue(o.restartX.isNaN() && o.declineX.isNaN(), "no button on the start screen may be taken for the restart / decline button")
    }

    @Test
    fun traceExternalFrames() {
        val dir = System.getenv("MRGUN_FRAMES")?.let { File(it) } ?: run { println("MRGUN_FRAMES unset — skip"); return }
        val files = dir.listFiles { f -> f.name.endsWith(".png") }?.sortedBy { it.name } ?: emptyList()
        if (files.isEmpty()) { println("no png in $dir"); return }
        val fps = System.getenv("MRGUN_FPS")?.toDoubleOrNull() ?: 60.0
        val st = run(files, fps, verbose = System.getenv("MRGUN_VERBOSE") != null, warmup = 0)
        println("external: frames ${st.frames} pivot ${st.pivot} angle ${st.angle} enemy ${st.enemy} fires ${st.fires} restart ${st.restart}")
    }
}
