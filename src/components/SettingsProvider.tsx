import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { loadSettings, saveSettings, applyTheme } from '../lib/settings';
import type { Settings } from '../lib/settings';
import { SettingsContext } from '../hooks/useSettings';

// Mount keyed by userId so an account switch remounts with that user's
// persisted settings.
export default function SettingsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings(userId));

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  // Persist only on explicit change: saving defaults on mount would pin a
  // user who never opened Settings to TODAY'S defaults, defeating the
  // forward-compat merge in loadSettings. The save inside the updater runs
  // twice under StrictMode; writing identical JSON twice is harmless.
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(userId, next);
      return next;
    });
  }, [userId]);

  const value = useMemo(() => ({ settings, update }), [settings, update]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
