package ai.arena.core

import ai.arena.core.control.PhysicsEstimator
import ai.arena.core.sim.FlappySim
import ai.arena.core.sim.Skins
import kotlin.math.abs
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertTrue

class PhysicsTest {

    @Test
    fun estimatesGravityFlapAndLatencyFromNoisyTrajectory() {
        val latencyFrames = 4
        for (skin in Skins.all) {
            val sim = FlappySim(skin, seed = 11)
            val phys = PhysicsEstimator(sim.h)
            val rnd = Random(5)
            val pendingFlaps = ArrayDeque<Int>()
            val fps = 60.0
            for (i in 0 until 900) {
                val t = i * FlappySim.FRAME_NANOS
                // "tap" theo oracle, hiệu lực sau latencyFrames khung (giống điện thoại thật)
                if (sim.oracleFlap() && (pendingFlaps.isEmpty() || i - pendingFlaps.last() > 6)) { pendingFlaps.addLast(i); phys.onTap(t) }
                val flapNow = pendingFlaps.isNotEmpty() && i - pendingFlaps.first() >= latencyFrames
                if (flapNow) pendingFlaps.removeFirst()
                sim.step(flapNow)
                if (sim.dead) break
                phys.onBird(t, sim.birdY + (rnd.nextDouble() - 0.5) * 0.8)
            }
            val gTrue = skin.gravity * fps * fps
            val vTrue = skin.flapVy * fps
            val latTrue = latencyFrames / fps
            println("[${skin.name}] $phys · true g=${"%.0f".format(gTrue)} vFlap=${"%.0f".format(vTrue)} lat=${"%.0f".format(latTrue * 1000)}ms · frames ${sim.frame} score ${sim.score}")
            assertTrue(phys.gravitySamples >= 3, "[${skin.name}] too few gravity samples")
            assertTrue(abs(phys.gravity - gTrue) <= 0.2 * gTrue, "[${skin.name}] gravity ${phys.gravity} vs $gTrue")
            assertTrue(abs(phys.flapVelocity - vTrue) <= 0.2 * abs(vTrue), "[${skin.name}] flap ${phys.flapVelocity} vs $vTrue")
            assertTrue(abs(phys.latencySec - latTrue) <= 1.5 / fps, "[${skin.name}] latency ${phys.latencySec} vs $latTrue")
        }
    }
}
