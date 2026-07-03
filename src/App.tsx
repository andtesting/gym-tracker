import { useState, useEffect, useRef, useCallback } from 'react';
import type { Screen } from './types';
import { isSupabaseConfigured } from './supabase';
import { useAuth } from './hooks/useAuth';
import { loadActiveWorkout, clearActiveWorkout, validatePersistedSession } from './lib/sessionPersistence';
import LoginScreen from './components/LoginScreen';
import ResetPasswordScreen from './components/ResetPasswordScreen';
import HomeScreen from './components/HomeScreen';
import SessionDetail from './components/SessionDetail';
import PickRoutineScreen from './components/PickRoutineScreen';
import ActiveWorkout from './components/ActiveWorkout';
import EditModeScreen from './components/EditModeScreen';
import TrendsView from './components/TrendsView';
import LogPastWorkoutScreen from './components/LogPastWorkoutScreen';

function SetupScreen() {
  return (
    <div className="app" style={{ padding: '2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Gym Tracker</h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: '1.5rem' }}>
        Supabase is not configured yet.
      </p>
      <div style={{ textAlign: 'left', background: 'var(--color-surface)', padding: '1rem', borderRadius: '8px', fontSize: '0.9rem' }}>
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

const loadingScreen = <div className="app text-center text-muted mt-16">Loading...</div>;

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [resumeChecked, setResumeChecked] = useState(false);
  const { session, loading, recovery, clearRecovery } = useAuth();
  const screenRef = useRef(screen);

  // Screen state stays the source of truth; the History API mirrors it one
  // entry deep so the iOS edge-swipe (browser back) navigates instead of
  // exiting the PWA (AND-46). The hierarchy is flat: back always means Home.
  // Leaving Home pushes a single entry; navigating between non-home screens
  // reuses it; returning Home via the UI consumes it with history.back() so
  // the stack never grows.
  const navigate = useCallback((next: Screen) => {
    const prev = screenRef.current;
    if (next.name !== 'home' && prev.name === 'home') {
      history.pushState({ app: true }, '');
    } else if (next.name === 'home' && prev.name !== 'home') {
      history.back();
    }
    screenRef.current = next;
    setScreen(next);
  }, []);

  useEffect(() => {
    // A reload can land on a previously pushed app entry while screen state
    // resets to Home; reclaim whatever entry we booted on as the base so the
    // stack depth matches the screen state again.
    history.replaceState(null, '');
    const onPop = () => {
      // Back gesture from an active workout behaves like the Home button:
      // the session persists (localStorage + Supabase) and can be resumed.
      screenRef.current = { name: 'home' };
      setScreen({ name: 'home' });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (loading || !session || resumeChecked) return;
    const persisted = loadActiveWorkout();
    if (!persisted) {
      setResumeChecked(true);
      return;
    }
    validatePersistedSession(persisted.sessionId).then(valid => {
      if (valid) {
        navigate({
          name: 'activeWorkout',
          sessionId: persisted.sessionId,
          routineId: persisted.routineId,
          routineName: persisted.routineName,
        });
      } else {
        clearActiveWorkout();
      }
      setResumeChecked(true);
    });
  }, [loading, session, resumeChecked, navigate]);

  if (!isSupabaseConfigured) return <SetupScreen />;
  if (loading) return loadingScreen;
  // A recovery-link session must set a new password before reaching the app,
  // so the link can't be used as a silent passwordless login.
  if (session && recovery) return <ResetPasswordScreen onComplete={clearRecovery} />;
  if (!session) return <LoginScreen />;
  if (!resumeChecked) return loadingScreen;

  return (
    <div className="app">
      {screen.name === 'home' && (
        <HomeScreen onNavigate={navigate} />
      )}
      {screen.name === 'sessionDetail' && (
        <SessionDetail
          sessionId={screen.sessionId}
          onBack={() => navigate({ name: 'home' })}
        />
      )}
      {screen.name === 'pickRoutine' && (
        <PickRoutineScreen onNavigate={navigate} />
      )}
      {screen.name === 'activeWorkout' && (
        <ActiveWorkout
          sessionId={screen.sessionId}
          routineId={screen.routineId}
          routineName={screen.routineName}
          onFinish={() => navigate({ name: 'home' })}
          onHome={() => navigate({ name: 'home' })}
        />
      )}
      {screen.name === 'editMode' && (
        <EditModeScreen onBack={() => navigate({ name: 'home' })} />
      )}
      {screen.name === 'trends' && (
        <TrendsView onBack={() => navigate({ name: 'home' })} />
      )}
      {screen.name === 'logPastWorkout' && (
        <LogPastWorkoutScreen onNavigate={navigate} initialDate={screen.date} />
      )}
      {screen.name === 'retroactiveWorkout' && (
        <ActiveWorkout
          sessionId={screen.sessionId}
          routineId={screen.routineId}
          routineName={screen.routineName}
          retroactive
          retroactiveDate={screen.date}
          onFinish={() => navigate({ name: 'home' })}
          onHome={() => navigate({ name: 'home' })}
        />
      )}
    </div>
  );
}
