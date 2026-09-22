package ai.arena.core

import ai.arena.core.agent.FlappyAgent
import ai.arena.core.sim.FlappySim
import ai.arena.core.sim.Skins
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * Bài kiểm tra nghiệm thu M1: tác nhân chỉ nhìn KHUNG HÌNH (không biết trạng thái mô phỏng),
 * cú tap có hiệu lực sau vài khung như trên điện thoại, và phải vượt được một số ống nhất định
 * trên mọi skin.
 */
class ClosedLoopTest {

    private fun run(skinName: String, latencyFrames: Int, maxFrames: Int, seed: Long): Pair<Int, String> {
        val skin = Skins.all.first { it.name == skinName }
        val sim = FlappySim(skin, seed = seed)
        val agent = FlappyAgent(sim.w, sim.h)
        val pending = ArrayDeque<Int>()
        var lastStatus = ""
        var lastFrame = sim.render()
        for (i in 0 until maxFrames) {
            val out = agent.onFrame(lastFrame, i * FlappySim.FRAME_NANOS)
            if (out.tap) pending.addLast(i)
            val flapNow = pending.isNotEmpty() && i - pending.first() >= latencyFrames
            if (flapNow) pending.removeFirst()
            sim.step(flapNow)
            lastStatus = out.status
            if (sim.dead) break
            lastFrame = sim.render()
        }
        return sim.score to "$lastStatus · frames ${sim.frame}"
    }

    @Test
    fun agentSurvivesOnEverySkinFromPixelsOnly() {
        val minScore = 12
        val results = Skins.all.map { skin ->
            val (score, status) = run(skin.name, latencyFrames = 4, maxFrames = 3600, seed = 21)
            println("[${skin.name}] score $score · $status")
            skin.name to score
        }
        val failed = results.filter { it.second < minScore }
        assertTrue(failed.isEmpty(), "skins below $minScore pipes: $failed")
    }
}
