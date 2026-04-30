import { useState } from 'react';
import type { Screen } from './types';
import HomeScreen from './components/HomeScreen';
import SessionDetail from './components/SessionDetail';
import PickRoutineScreen from './components/PickRoutineScreen';
import ActiveWorkout from './components/ActiveWorkout';

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  return (
    <div className="app">
      {screen.name === 'home' && (
        <HomeScreen onNavigate={setScreen} />
      )}
      {screen.name === 'sessionDetail' && (
        <SessionDetail
          sessionId={screen.sessionId}
          onBack={() => setScreen({ name: 'home' })}
        />
      )}
      {screen.name === 'pickRoutine' && (
        <PickRoutineScreen onNavigate={setScreen} />
      )}
      {screen.name === 'activeWorkout' && (
        <ActiveWorkout
          sessionId={screen.sessionId}
          routineId={screen.routineId}
          routineName={screen.routineName}
          onFinish={() => setScreen({ name: 'home' })}
        />
      )}
    </div>
  );
}
