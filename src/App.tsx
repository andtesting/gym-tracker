import { useState } from 'react';
import type { Screen } from './types';
import { isSupabaseConfigured } from './supabase';
import HomeScreen from './components/HomeScreen';
import SessionDetail from './components/SessionDetail';
import PickRoutineScreen from './components/PickRoutineScreen';
import ActiveWorkout from './components/ActiveWorkout';

function SetupScreen() {
  return (
    <div className="app" style={{ padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Gym Tracker</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        Supabase is not configured yet.
      </p>
      <div style={{ textAlign: 'left', background: '#f5f5f5', padding: '1rem', borderRadius: '8px', fontSize: '0.9rem' }}>
        <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>To get started:</p>
        <ol style={{ paddingLeft: '1.2rem', lineHeight: 1.8 }}>
          <li>Create a project at supabase.com</li>
          <li>Run <code>sql/schema.sql</code> in the SQL Editor</li>
          <li>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your environment</li>
          <li>Rebuild and redeploy</li>
        </ol>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  if (!isSupabaseConfigured) return <SetupScreen />;

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
