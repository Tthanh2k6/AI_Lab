package ai.arena.core

import ai.arena.core.agent.MrGunAgent
import ai.arena.core.sim.FlappySim
import ai.arena.core.sim.MrGunSim
import ai.arena.core.sim.MrGunSkins
import kotlin.test.Test

/** Vết chẩn đoán Mr Gun (chỉ in): góc thật/đo, địch thật/đo, quyết định — cho các khung quanh sự kiện. */
class MrGunDiagTest {

    private fun trace(skinName: String, from: Int, to: Int, tailOnDeath: Int) {
        val skin = MrGunSkins.all.first { it.name == skinName }
        val sim = MrGunSim(skin, seed = 9)
        val agent = MrGunAgent(sim.w, sim.h)
        val pending = ArrayDeque<Int>()
        val tail = ArrayDeque<String>()
        var frame = sim.render()
        println("[$skinName] f | simAngle side steps hp | detAngle w sweep | headTrue → headDet | tap reason | detail")
        for (i in 0 until 4000) {
            val trueAngle = if (sim.transitionLeft == 0) sim.angleNow else Double.NaN
            val trueHead = "%.0f,%.0f".format(sim.enemyHeadX, sim.enemyHeadY)
            val out = agent.onFrame(frame, i * FlappySim.FRAME_NANOS)
            if (out.tap) pending.addLast(i)
            val fire = pending.isNotEmpty() && i - pending.first() >= 8
            if (fire) pending.removeFirst()
            val o = out.observation
            val line = "%4d | %6.1f %2d %d %d | %6.1f %5.0f [%.0f,%.0f] | %s → %s | %s %s | %s".format(
                i, trueAngle, sim.side, sim.steps, sim.enemyHp,
                o.angleDeg, o.angularVelDegPerSec, o.sweepMinDeg, o.sweepMaxDeg,
                trueHead, o.enemy?.let { "%.0f,%.0f".format(it.headX, it.headY) } ?: "--",
                if (out.tap) "TAP" else "   ", out.reason, out.detail)
            if (i in from..to) println(line)
            tail.addLast(line); if (tail.size > tailOnDeath) tail.removeFirst()
            val shot = if (fire) sim.shoot() else ""
            sim.step(fire)
            if (fire) println("      ↳ shot at frame $i result=$shot kills=${sim.kills}")
            if (sim.dead) { println("DEAD at frame ${sim.frame} kills=${sim.kills}"); tail.forEach { println(it) }; break }
            frame = sim.render()
        }
    }

    @Test
    fun traceDark() = trace("dark", -1, -1, 70)

    @Test
    fun traceFast() = trace("fast", -1, -1, 70)

    @Test
    fun traceBoss() = trace("boss", -1, -1, 70)
}
