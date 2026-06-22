import { useState } from 'react';
import SelectGameScreen from './components/SelectGameScreen';
import SetupScreen from './components/SetupScreen';
import TrainingScreen from './components/TrainingScreen';
import RacingScreen from './components/RacingScreen';
import FootballScreen from './components/FootballScreen';
import { AIConfig, RacingConfig } from './types/game';
import { FootballConfig } from './types/football';

type Screen = 'select' | 'setup' | 'caro-arena' | 'racing-arena' | 'football-arena';

function App() {
  const [screen, setScreen] = useState<Screen>('select');
  const [gameType, setGameType] = useState<'caro' | 'racing' | 'football'>('caro');

  // Caro configuration states
  const [configX, setConfigX] = useState<AIConfig | null>(null);
  const [configO, setConfigO] = useState<AIConfig | null>(null);
  const [initFromScratch, setInitFromScratch] = useState<boolean>(true);

  // Racing configuration state
  const [racingConfig, setRacingConfig] = useState<RacingConfig | null>(null);

  // Football configuration state
  const [footballConfig, setFootballConfig] = useState<FootballConfig | null>(null);

  // Navigation handlers
  const handleSelectGame = (gameId: 'caro' | 'racing' | 'football') => {
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

  const handleLaunchFootball = (config: FootballConfig) => {
    setFootballConfig(config);
    setScreen('football-arena');
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
          onLaunchFootball={handleLaunchFootball}
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

      {screen === 'football-arena' && footballConfig && (
        <FootballScreen
          config={footballConfig}
          onBack={handleBackToSetup}
        />
      )}
    </main>
  );
}

export default App;
