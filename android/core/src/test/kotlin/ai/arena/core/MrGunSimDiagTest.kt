package ai.arena.core

import ai.arena.core.agent.MrGunAgent
import ai.arena.core.sim.FlappySim
import ai.arena.core.sim.MrGunSim
import ai.arena.core.sim.MrGunSkins
import ai.arena.core.vision.MrGunDetector
import kotlin.math.abs
import kotlin.test.Test

/**
 * Chẩn đoán (chỉ in) bộ nhận diện trên mô phỏng:
 *  MRGUN_SIM_SKIN=classic  MRGUN_SIM_RANGE=a,b  (in khối tĩnh + bản đồ tiền cảnh cho các khung trong khoảng)
 *  MRGUN_SIM_BAD=1  (chỉ in khung địch sai / thiếu, tối đa MRGUN_SIM_MAX khung)
 *  MRGUN_SIM_AGENT=1  (chạy MrGunAgent, seed 9 như MrGunTest.agentKillsEnemiesFromPixelsOnly; mặc định: chính sách biết hết, seed 5)
 */
class MrGunSimDiagTest {
    @Test
    fun diagSim() {
        val skinName = System.getenv("MRGUN_SIM_SKIN") ?: return
        val (from, to) = (System.getenv("MRGUN_SIM_RANGE") ?: "60,900").split(",").map { it.toInt() }
        val onlyBad = System.getenv("MRGUN_SIM_BAD") != null
        val useAgent = System.getenv("MRGUN_SIM_AGENT") != null
        val maxPrint = (System.getenv("MRGUN_SIM_MAX") ?: "6").toInt()
        val brief = System.getenv("MRGUN_SIM_BRIEF") != null // một dòng mỗi khung trong khoảng (kể cả chuyển cảnh), không in bản đồ
        val skin = MrGunSkins.all.first { it.name == skinName }
        val latencyFrames = 4
        val sim = MrGunSim(skin, seed = if (useAgent) 9 else 5)
        val agent = MrGunAgent(sim.w, sim.h)
        val det = agent.detector
        val pending = ArrayDeque<Int>()
        var printed = 0
        var frames = 0; var good = 0
        var frame = sim.render()
        for (i in 0 until 4000) {
            if (!useAgent && sim.oracleTap(latencyFrames) && (pending.isEmpty() || i - pending.last() > 10)) pending.addLast(i)
            val trueAngle = if (sim.transitionLeft == 0) sim.angleNow else Double.NaN
            val obs: ai.arena.core.vision.MrGunObservation
            var reason = ""
            if (useAgent) {
                val out = agent.onFrame(frame, i * FlappySim.FRAME_NANOS)
                if (out.tap) pending.addLast(i)
                obs = out.observation; reason = (if (out.tap) "TAP " else "") + out.reason + " " + out.detail
            } else obs = det.process(frame, i * FlappySim.FRAME_NANOS)
            val fire = pending.isNotEmpty() && i - pending.first() >= latencyFrames
            if (fire) pending.removeFirst()
            val headX = sim.enemyHeadX; val headY = sim.enemyHeadY
            val side = sim.side; val steps = sim.steps
            val px = sim.pivotX; val py = sim.pivotY
            sim.step(fire)
            if (sim.dead) { println("DEAD at $i kills=${sim.kills}"); break }
            if (!useAgent && i >= 900) break
            frame = sim.render()
            if (brief && i in from..to) {
                println("%4d motion=%.4f trans=%s simTrans=%d angle=%.1f | %s | %s".format(i, obs.motionFrac, obs.transition, sim.transitionLeft, obs.angleDeg, det.debug, reason))
                continue
            }
            if (i < 60 || sim.transitionLeft > 0 || obs.transition) continue
            frames++
            val e = obs.enemy
            val ok = e != null && abs(e.headX - headX) <= 0.02 * sim.h && abs(e.headY - headY) <= 0.02 * sim.h
            if (ok) good++
            if (i !in from..to) continue
            if (onlyBad && ok) continue
            if (printed >= maxPrint) continue
            printed++
            println("---- [$skinName] f=$i side=$side steps=$steps trueAngle=%.1f trueHead=(%.0f,%.0f) truePivot=(%.0f,%.0f) ok=$ok $reason".format(trueAngle, headX, headY, px, py))
            println("     ${det.debug}")
            for (b in det.debugBlobs()) {
                val w = b[1] - b[0] + 1; val hh = b[3] - b[2] + 1
                println("     blob x=%d..%d y=%d..%d n=%d w=%d h=%d aspect=%.2f density=%.2f hFrac=%.3f".format(b[0], b[1], b[2], b[3], b[4], w, hh, hh.toDouble() / w, b[4].toDouble() / (w * hh), hh.toDouble() / sim.h))
            }
            val c = det.debugScanCounts
            val sb0 = StringBuilder("     scan counts (deg:n, n>0): ")
            for (bin in c.indices) if (c[bin] > 0) sb0.append("%d:%d ".format(bin - 30, c[bin]))
            println(sb0)
            // Bản đồ quanh tâm xoay + địch: # = tiền cảnh tự do, b = tiền cảnh bị chặn (tĩnh), ~ = chuyển động, | = mặt nạ vạch, . = nền
            val cx = if (obs.pivotValid) obs.pivotX.toInt() else px.toInt(); val cy = if (obs.pivotValid) obs.pivotY.toInt() else py.toInt()
            val x0 = minOf(cx, headX.toInt()) - 14; val x1 = maxOf(cx, headX.toInt()) + 14
            val y0 = (minOf(cy, headY.toInt()) - 10).coerceAtLeast(0); val y1 = (cy + 18).coerceAtMost(sim.h - 1)
            println("     map x=${x0.coerceAtLeast(0)}..${x1.coerceAtMost(sim.w - 1)}  (@ = tâm xoay)")
            for (y in y0..y1) {
                val sb = StringBuilder("%3d ".format(y))
                for (x in x0.coerceAtLeast(0)..x1.coerceAtMost(sim.w - 1)) {
                    val fgp = det.debugForeground(x, y)
                    sb.append(when {
                        x == cx && y == cy -> '@'
                        det.debugMoving(x, y) -> '~'
                        fgp && det.debugBlocked(x, y) -> 'b'
                        fgp -> '#'
                        det.debugLineMask(x, y) -> '|'
                        else -> '.'
                    })
                }
                println(sb)
            }
        }
        println("[$skinName] enemy ok $good/$frames")
    }
}
