# AI Game Arena

Nine small games where you can watch game-playing algorithms work: search trees for board games, neuroevolution for driving and flying, Q-learning for a maze, and two 3D games where agents evolve against each other. Everything runs in the browser, written in TypeScript without an ML library (the only runtime dependencies are React and Three.js).

Live demo: https://ai-lab-tthanh2006.vercel.app

[![AI Game Arena](https://raw.githubusercontent.com/Tthanh2k6/Portfolio/main/public/IMG/project-ailab.png)](https://ai-lab-tthanh2006.vercel.app)

## The games

| Game | Algorithm |
| --- | --- |
| Gomoku (20×20) | Minimax with alpha-beta, iterative deepening and a Zobrist transposition table, in a Web Worker; or MCTS (UCT). AI vs AI or human vs AI. |
| Connect Four | Minimax with alpha-beta and a window-scoring evaluation |
| 2048 | Expectimax with monotonicity, smoothness and empty-tile scores |
| Racing (2D) | Small feedforward network evolved with a genetic algorithm, ray-cast distance sensors; you can draw your own track |
| Flappy Bird | Neuroevolution: elitism, crossover, Gaussian mutation |
| Q-Maze | Tabular Q-learning with ε-greedy exploration; the Q-values are drawn as arrows |
| Soccer 3D | One-vs-one neuroevolution in Three.js |
| Tag 3D | Co-evolution of a chaser and a runner in Three.js |
| Cell War | Heuristic territory game between several factions |

## Run it

```powershell
git clone https://github.com/Tthanh2k6/AI_Lab.git
cd AI_Lab
npm ci
npm run dev              # http://localhost:5173
npm run electron:dev     # same app in an Electron window
npm run build            # type-check and build to dist/
npm run electron:build   # Windows installer in release/
```

## Android agent (`android/`)

A separate Kotlin experiment: it reads the phone screen with `MediaProjection`, finds the player and obstacles with hand-written image checks, predicts the timing, and taps through an `AccessibilityService`, without root. It targets Flappy Bird and Mr Gun. The detectors are tested against simulators and saved screenshots in `android/core/src/test`.

```powershell
cd android
.\gradlew.bat :core:test
.\gradlew.bat :app:assembleDebug
```

## Author

Trung Thanh Tran, [GitHub](https://github.com/Tthanh2k6)
