import { createContext, useContext } from 'react';
import { DEFAULT_SETTINGS } from '../lib/settings';
import type { Settings } from '../lib/settings';

export interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
});

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
