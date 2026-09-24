package ai.arena.core

import ai.arena.core.agent.MrGunAgent
import ai.arena.core.sim.FlappySim
import ai.arena.core.sim.MrGunSim
import ai.arena.core.sim.MrGunSkins
import ai.arena.core.vision.MrGunDetector
import kotlin.math.abs
import kotlin.math.sqrt
import kotlin.test.Test
import kotlin.test.assertTrue

class MrGunTest {

    @Test
    fun detectorFindsPivotLineAndEnemyOnEverySkin() {
        val latencyFrames = 7
        for (skin in MrGunSkins.all) {
            val sim = MrGunSim(skin, seed = 5)
            val det = MrGunDetector(sim.w, sim.h)
            val pending = ArrayDeque<Int>()
            var frames = 0; var lineFrames = 0; var angleGood = 0; var pivotGood = 0; var enemyFrames = 0; var enemyGood = 0
            var pivotErrSum = 0.0
            for (i in 0 until 900) {
                if (sim.oracleTap(latencyFrames) && (pending.isEmpty() || i - pending.last() > 10)) pending.addLast(i)
                val fire = pending.isNotEmpty() && i - pending.first() >= latencyFrames
                if (fire) pending.removeFirst()
                val obs = det.process(sim.render(), i * FlappySim.FRAME_NANOS)
                sim.step(fire)
                if (sim.dead) break
                if (i < 60 || sim.transitionLeft > 0 || obs.transition) continue
                frames++
                if (obs.pivotValid) {
                    val err = sqrt((obs.pivotX - sim.pivotX) * (obs.pivotX - sim.pivotX) + (obs.pivotY - sim.pivotY) * (obs.pivotY - sim.pivotY))
                    pivotErrSum += err
                    if (err <= 0.03 * sim.h) pivotGood++
                }
                if (!obs.angleDeg.isNaN()) lineFrames++
                val e = obs.enemy
                enemyFrames++
                if (e != null && abs(e.headX - sim.enemyHeadX) <= 0.02 * sim.h && abs(e.headY - sim.enemyHeadY) <= 0.02 * sim.h) enemyGood++
            }
            // Góc: đo riêng bằng cách so với góc thật lưu lại lúc render
            val angleStats = measureAngle(skin, latencyFrames)
            println("[${skin.name}] frames $frames · pivot ok $pivotGood (mean err %.1f) · line seen $lineFrames · angle ok ${angleStats.first}/${angleStats.second} · enemy ok $enemyGood/$enemyFrames · kills ${sim.kills} head ${sim.headshots}".format(pivotErrSum / frames.coerceAtLeast(1)))
            assertTrue(frames > 200, "[${skin.name}] oracle died early (kills ${sim.kills})")
            assertTrue(pivotGood >= 0.85 * frames, "[${skin.name}] pivot ok $pivotGood/$frames")
            assertTrue(angleStats.first >= 0.85 * angleStats.second, "[${skin.name}] angle ok ${angleStats.first}/${angleStats.second}")
            assertTrue(enemyGood >= 0.85 * enemyFrames, "[${skin.name}] enemy ok $enemyGood/$enemyFrames")
        }
    }

    /** (số khung góc đúng trong ±2°, số khung có vạch) — chạy lại mô phỏng và ghi góc thật tại lúc render. */
    private fun measureAngle(skin: ai.arena.core.sim.MrGunSkin, latencyFrames: Int): Pair<Int, Int> {
        val sim = MrGunSim(skin, seed = 5)
        val det = MrGunDetector(sim.w, sim.h)
        val pending = ArrayDeque<Int>()
        var good = 0; var seen = 0
        for (i in 0 until 900) {
            if (sim.oracleTap(latencyFrames) && (pending.isEmpty() || i - pending.last() > 10)) pending.addLast(i)
            val fire = pending.isNotEmpty() && i - pending.first() >= latencyFrames
            if (fire) pending.removeFirst()
            val trueAngle = if (sim.transitionLeft == 0) sim.angleNow else Double.NaN
            val obs = det.process(sim.render(), i * FlappySim.FRAME_NANOS)
            sim.step(fire)
            if (sim.dead) break
            if (i < 60 || trueAngle.isNaN() || obs.transition) continue
            if (!obs.angleDeg.isNaN()) { seen++; if (abs(MrGunDetector.wrapDeg(obs.angleDeg - trueAngle)) <= 2.0) good++ }
        }
        return good to seen
    }

    @Test
    fun agentKillsEnemiesFromPixelsOnly() {
        val latencyFrames = 7
        val minKills = 15
        val results = MrGunSkins.all.map { skin ->
            val sim = MrGunSim(skin, seed = 9)
            val agent = MrGunAgent(sim.w, sim.h)
            val pending = ArrayDeque<Int>()
            var lastStatus = ""; var lastDetail = ""
            var frame = sim.render()
            for (i in 0 until 4000) {
                val out = agent.onFrame(frame, i * FlappySim.FRAME_NANOS)
                if (out.tap) pending.addLast(i)
                val fire = pending.isNotEmpty() && i - pending.first() >= latencyFrames
                if (fire) pending.removeFirst()
                lastStatus = out.status; lastDetail = out.detail
                sim.step(fire)
                if (sim.dead) break
                frame = sim.render()
            }
            println("[${skin.name}] kills ${sim.kills} (head ${sim.headshots}) frames ${sim.frame} dead=${sim.dead} · $lastStatus · $lastDetail")
            skin.name to sim.kills
        }
        val failed = results.filter { it.second < minKills }
        assertTrue(failed.isEmpty(), "skins below $minKills kills: $failed")
    }
}
