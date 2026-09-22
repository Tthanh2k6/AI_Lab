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
            if (!o.restartX.isNaN()) st.restart++
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
        assertEquals(0, st.restart, "no restart button must be reported during play")
    }

    @Test
    fun restartButtonFoundOnGameOverScreen() {
        val frame = load(File(javaClass.getResource("/mrgun_gameover.png")!!.toURI()))
        val det = MrGunDetector(frame.width, frame.height)
        var obs: MrGunObservation? = null
        for (i in 0 until 20) obs = det.process(frame, i * 16_666_667L)
        val o = obs!!
        println("gameover: restart=(%.0f,%.0f) angle=%.1f enemy=%s | %s".format(o.restartX, o.restartY, o.angleDeg, o.enemy, det.debug))
        assertTrue(!o.restartX.isNaN(), "restart button not found")
        val fx = o.restartX / frame.width; val fy = o.restartY / frame.height
        assertTrue(abs(fx - 0.53) < 0.06 && abs(fy - 0.78) < 0.05, "restart at (%.2f, %.2f) of screen".format(fx, fy))
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
