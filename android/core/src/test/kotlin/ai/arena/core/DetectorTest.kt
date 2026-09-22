package ai.arena.core

import ai.arena.core.sim.FlappySim
import ai.arena.core.sim.Skins
import ai.arena.core.vision.FlappyDetector
import ai.arena.core.vision.ScrollEstimator
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertTrue

class DetectorTest {

    @Test
    fun scrollEstimatorTracksSimScrollSpeed() {
        for (skin in Skins.all) {
            val sim = FlappySim(skin, seed = 3)
            val det = FlappyDetector(sim.w, sim.h)
            var good = 0; var total = 0
            var rawGood = 0
            val raw = ScrollEstimator(22)
            var prev = sim.render()
            repeat(150) { i ->
                sim.step(sim.oracleFlap())
                val cur = sim.render()
                val obs = det.process(cur, i * FlappySim.FRAME_NANOS)
                if (i > 10) {
                    total++
                    if (abs(obs.scrollPxPerFrame - skin.scrollPxPerFrame) <= 0.5) good++
                    if (abs(raw.estimate(prev, cur, (0.06 * sim.h).toInt(), sim.h).shift - skin.scrollPxPerFrame) <= 0.5) rawGood++
                }
                prev = cur
            }
            println("[${skin.name}] scroll ok ${good}/$total (raw full-frame estimator: $rawGood/$total)")
            assertTrue(good >= 0.9 * total, "[${skin.name}] detector scroll ok on $good/$total frames")
        }
    }

    @Test
    fun detectorFindsBirdPipesAndGroundOnEverySkin() {
        for (skin in Skins.all) {
            val sim = FlappySim(skin, seed = 7)
            val det = FlappyDetector(sim.w, sim.h)
            var birdSeen = 0; var birdGood = 0; var birdFrames = 0
            var pipeFrames = 0; var pipeGood = 0
            var lastGroundErr = Double.NaN
            val warmup = 40
            val frames = 420
            for (i in 0 until frames) {
                sim.step(sim.oracleFlap())
                if (sim.dead) break
                val obs = det.process(sim.render(), i * FlappySim.FRAME_NANOS)
                if (i < warmup) continue
                birdFrames++
                val b = obs.bird
                if (b != null && !b.coasting) {
                    birdSeen++
                    if (abs(b.y - sim.birdY) <= 0.03 * sim.h && abs(b.x - sim.birdX) <= 0.05 * sim.w) birdGood++
                }
                val truePipe = sim.pipes.firstOrNull { it.x + sim.pipeW > 0.05 * sim.w && it.x < 0.9 * sim.w }
                if (truePipe != null) {
                    pipeFrames++
                    val trueCenterX = truePipe.x + sim.pipeW / 2.0
                    val match = obs.pipes.minByOrNull { abs((it.left + it.right) / 2.0 - trueCenterX) }
                    if (match != null && abs((match.left + match.right) / 2.0 - trueCenterX) <= 0.04 * sim.w &&
                        abs(match.gapTop - truePipe.gapTop) <= 0.035 * sim.h &&
                        abs(match.gapBottom - (truePipe.gapTop + sim.gap)) <= 0.035 * sim.h
                    ) pipeGood++
                }
                lastGroundErr = abs(obs.groundY - sim.groundY).toDouble()
            }
            println("[${skin.name}] bird seen $birdSeen/$birdFrames good $birdGood · pipe good $pipeGood/$pipeFrames · ground err $lastGroundErr · score ${sim.score}")
            assertTrue(birdFrames > 100, "[${skin.name}] oracle died too early (score ${sim.score})")
            assertTrue(birdSeen >= 0.85 * birdFrames, "[${skin.name}] bird seen on $birdSeen/$birdFrames frames")
            assertTrue(birdGood >= 0.85 * birdSeen, "[${skin.name}] bird position accurate on $birdGood/$birdSeen frames")
            assertTrue(pipeGood >= 0.8 * pipeFrames, "[${skin.name}] pipe gap accurate on $pipeGood/$pipeFrames frames")
            assertTrue(lastGroundErr <= 0.03 * sim.h, "[${skin.name}] ground error $lastGroundErr")
        }
    }
}
