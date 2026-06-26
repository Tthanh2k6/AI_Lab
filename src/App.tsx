import { useState } from 'react';
import SelectGameScreen from './components/SelectGameScreen';
import SetupScreen from './components/SetupScreen';
import TrainingScreen from './components/TrainingScreen';
import RacingScreen from './components/RacingScreen';
import FlappyScreen from './components/FlappyScreen';
import Game2048Screen from './components/Game2048Screen';
import QMazeScreen from './components/QMazeScreen';
import Connect4Screen from './components/Connect4Screen';
import Soccer2Screen from './components/Soccer2Screen';
import TagScreen from './components/TagScreen';
import { AIConfig, RacingConfig, FlappyConfig, Game2048Config, QMazeConfig, Connect4Config, SoccerConfig, TagConfig } from './types/game';

type Screen = 'select' | 'setup' | 'caro-arena' | 'racing-arena' | 'flappy-arena' | '2048-arena' | 'qmaze-arena' | 'connect4-arena' | 'soccer-arena' | 'tag-arena';

function App() {
  const [screen, setScreen] = useState<Screen>('select');
  const [gameType, setGameType] = useState<'caro' | 'racing' | 'flappy' | '2048' | 'qmaze' | 'connect4' | 'soccer' | 'tag'>('caro');

  // Caro configuration states
  const [configX, setConfigX] = useState<AIConfig | null>(null);
  const [configO, setConfigO] = useState<AIConfig | null>(null);
  const [initFromScratch, setInitFromScratch] = useState<boolean>(true);

  // Racing configuration state
  const [racingConfig, setRacingConfig] = useState<RacingConfig | null>(null);

  // Flappy Bird configuration state
  const [flappyConfig, setFlappyConfig] = useState<FlappyConfig | null>(null);

  // 2048 configuration state
  const [game2048Config, setGame2048Config] = useState<Game2048Config | null>(null);

  // Q-learning maze configuration state
  const [qmazeConfig, setQmazeConfig] = useState<QMazeConfig | null>(null);

  // Connect Four configuration state
  const [connect4Config, setConnect4Config] = useState<Connect4Config | null>(null);

  // Soccer configuration state
  const [soccerConfig,  setSoccerConfig]  = useState<SoccerConfig  | null>(null);

  // Tag game configuration state
  const [tagConfig, setTagConfig] = useState<TagConfig | null>(null);

  // Navigation handlers
  const handleSelectGame = (gameId: 'caro' | 'racing' | 'flappy' | '2048' | 'qmaze' | 'connect4' | 'soccer' | 'tag') => {
    setGameType(gameId);
    setScreen('setup');
  };

  const handleBackToSelect = () => setScreen('select');
  const handleBackToSetup  = () => setScreen('setup');

  const handleLaunchCaroArena = (c1: AIConfig, c2: AIConfig, fromScratch: boolean) => {
    setConfigX(c1);
    setConfigO(c2);
    setInitFromScratch(fromScratch);
    setScreen('caro-arena');
  };

  const handleLaunchRacing = (config: RacingConfig) => {
    setRacingConfig(config);
    setScreen('racing-arena');
  };

  const handleLaunchFlappy = (config: FlappyConfig) => {
    setFlappyConfig(config);
    setScreen('flappy-arena');
  };

  const handleLaunch2048 = (config: Game2048Config) => {
    setGame2048Config(config);
    setScreen('2048-arena');
  };

  const handleLaunchQMaze = (config: QMazeConfig) => {
    setQmazeConfig(config);
    setScreen('qmaze-arena');
  };

  const handleLaunchConnect4 = (config: Connect4Config) => {
    setConnect4Config(config);
    setScreen('connect4-arena');
  };

  const handleLaunchSoccer = (config: SoccerConfig) => {
    setSoccerConfig(config);
    setScreen('soccer-arena');
  };

  const handleLaunchTag = (config: TagConfig) => {
    setTagConfig(config);
    setScreen('tag-arena');
  };

  return (
    <main className="w-full min-h-screen flex flex-col justify-between">
      {screen === 'select' && (
        <SelectGameScreen onSelectGame={handleSelectGame} />
      )}

      {screen === 'setup' && (
        <SetupScreen
          gameType={gameType}
          onBack={handleBackToSelect}
          onLaunchArena={handleLaunchCaroArena}
          onLaunchRacing={handleLaunchRacing}
          onLaunchFlappy={handleLaunchFlappy}
          onLaunch2048={handleLaunch2048}
          onLaunchQMaze={handleLaunchQMaze}
          onLaunchConnect4={handleLaunchConnect4}
          onLaunchSoccer={handleLaunchSoccer}
          onLaunchTag={handleLaunchTag}
        />
      )}

      {screen === 'caro-arena' && configX && configO && (
        <TrainingScreen
          initialConfigX={configX}
          initialConfigO={configO}
          initFromScratch={initFromScratch}
          onBack={handleBackToSetup}
        />
      )}

      {screen === 'racing-arena' && racingConfig && (
        <RacingScreen
          config={racingConfig}
          onBack={handleBackToSetup}
        />
      )}

      {screen === 'flappy-arena' && flappyConfig && (
        <FlappyScreen
          config={flappyConfig}
          onBack={handleBackToSetup}
        />
      )}

      {screen === '2048-arena' && game2048Config && (
        <Game2048Screen
          config={game2048Config}
          onBack={handleBackToSetup}
        />
      )}

      {screen === 'qmaze-arena' && qmazeConfig && (
        <QMazeScreen
          config={qmazeConfig}
          onBack={handleBackToSetup}
        />
      )}

      {screen === 'connect4-arena' && connect4Config && (
        <Connect4Screen
          config={connect4Config}
          onBack={handleBackToSetup}
        />
      )}

      {screen === 'soccer-arena' && soccerConfig && (
        <Soccer2Screen
          config={soccerConfig}
          onBack={handleBackToSetup}
        />
      )}

      {screen === 'tag-arena' && tagConfig && (
        <TagScreen
          config={tagConfig}
          onBack={handleBackToSetup}
        />
      )}
    </main>
  );
}

export default App;
