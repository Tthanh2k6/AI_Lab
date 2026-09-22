package ai.arena.core

import ai.arena.core.agent.FlappyAgent
import ai.arena.core.sim.FlappySim
import ai.arena.core.sim.Skins
import ai.arena.core.vision.FlappyDetector
import kotlin.math.abs
import kotlin.test.Test

/** Vết chẩn đoán (chỉ in, không assert) — dùng khi test nghiệm thu thất bại. */
class DiagTest {

    @Test
    fun traceClosedLoop() {
        // Chỉ in `tail` khung cuối trước khi chết (hoặc trước khi hết maxFrames)
        val skinName = System.getProperty("diag.skin") ?: "noground"
        val tail = 45
        val skin = Skins.all.first { it.name == skinName }
        val sim = FlappySim(skin, seed = 21)
        val agent = FlappyAgent(sim.w, sim.h)
        val pending = ArrayDeque<Int>()
        var frame = sim.render()
        val lines = ArrayDeque<String>()
        println("[$skinName] frame | simY simVy | detY rawY vy coast | pipes(true) | pipes(det) | tap reason | g vf lat | detail")
        for (i in 0 until 3600) {
            val out = agent.onFrame(frame, i * FlappySim.FRAME_NANOS)
            if (out.tap) pending.addLast(i)
            val flapNow = pending.isNotEmpty() && i - pending.first() >= 4
            if (flapNow) pending.removeFirst()
            val b = out.observation.bird
            val truePipes = sim.pipes.joinToString(",") { "%.0f:%.0f-%.0f".format(it.x, it.gapTop, it.gapTop + sim.gap) }
            val detPipes = out.observation.pipes.joinToString(",") { "${it.left}-${it.right}:${it.gapTop}-${it.gapBottom}" }
            lines.addLast("%3d | %5.1f %5.2f | %s | %s | %s | %s %s | %s | %s".format(
                i, sim.birdY, sim.birdVy,
                if (b == null) "  --  " else "%5.1f %5.1f %6.0f %s".format(b.y, b.rawY, b.vy, if (b.coasting) "C" else " "),
                truePipes, detPipes, if (out.tap) "TAP" else "   ", out.reason, agent.physics.toString(), out.detail,
            ))
            if (lines.size > tail) lines.removeFirst()
            sim.step(flapNow)
            if (sim.dead) { lines.addLast("DEAD at frame ${sim.frame} y=${sim.birdY} score=${sim.score} groundY=${sim.groundY}"); break }
            frame = sim.render()
        }
        lines.forEach { println(it) }
    }

    @Test
    fun traceTightBirdMisses() {
        val sim = FlappySim(Skins.tight, seed = 7)
        val det = FlappyDetector(sim.w, sim.h)
        var missInPipe = 0; var missOutside = 0; var coastInPipe = 0; var coastOutside = 0
        val examples = ArrayList<String>()
        var prevFrame = sim.render()
        for (i in 0 until 420) {
            sim.step(sim.oracleFlap())
            if (sim.dead) break
            val frame = sim.render()
            val obs = det.process(frame, i * FlappySim.FRAME_NANOS)
            if (i in 31..38) println("  f$i y=%.0f vy=%.1f bird=%s · %s".format(sim.birdY, sim.birdVy, obs.bird?.let { "%.0f%s".format(it.y, if (it.coasting) "C" else "") } ?: "--", det.debug))
            if (i == 36) {
                val by = sim.birdY.toInt(); val bx = sim.birdX.toInt()
                val shift = det.debugShift()
                println("  --- f36 pixel inspection: birdX=$bx birdY=$by shift=$shift groundY=${obs.groundY}")
                for (y in listOf(by - 6, by - 3, by, by + 3, by + 6)) {
                    val bg = det.debugBg(y)
                    val row = StringBuilder()
                    for (x in bx - 9..bx + 9) {
                        val c = frame.rgbAt(x, y)
                        val fg = det.debugIsForeground(c, y)
                        val xs = x + shift
                        val moved = if (xs < frame.width) ai.arena.core.vision.Frame.colorDistance(c, prevFrame.rgbAt(xs, y)) > 60 else true
                        val skip = det.debugIsPipeCol(x) && det.debugIsBorderCol(x)
                        row.append(if (skip) 'S' else if (fg && moved) 'M' else if (fg) 'f' else '.')
                    }
                    println("  y=$y bg=%06X pix(%06X) border=%s pipe=%s | %s".format(bg, frame.rgbAt(bx, y), det.debugIsBorderCol(bx), det.debugIsPipeCol(bx), row))
                }
            }
            prevFrame = frame
            if (i < 40) continue
            val b = obs.bird
            val inPipe = sim.pipes.any { sim.birdX + sim.birdR > it.x - 3 && sim.birdX - sim.birdR < it.x + sim.pipeW + 3 }
            if (b == null) { if (inPipe) missInPipe++ else missOutside++; if (examples.size < 16) examples.add("f$i miss y=%.0f vy=%.1f inPipe=$inPipe pipes=%s · %s".format(sim.birdY, sim.birdVy, sim.pipes.joinToString { "%.0f".format(it.x) }, det.debug)) }
            else if (b.coasting) { if (inPipe) coastInPipe++ else coastOutside++; if (examples.size < 16) examples.add("f$i coast y=%.0f inPipe=$inPipe · %s".format(sim.birdY, det.debug)) }
        }
        println("tight: miss inPipe=$missInPipe outside=$missOutside · coast inPipe=$coastInPipe outside=$coastOutside · birdR=${sim.birdR} pipeW=${sim.pipeW}")
        examples.forEach { println("  $it") }
        println("frames ${sim.frame} score ${sim.score} dead=${sim.dead}")
    }
}
