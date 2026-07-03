import { describe, it, expect, beforeEach } from 'vitest';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../../src/lib/settings';

describe('settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when nothing is stored', () => {
    expect(loadSettings('user-1')).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips per user', () => {
    saveSettings('user-1', { theme: 'dark', unit: 'lb', stepSmall: 2, stepLarge: 5, restCountdown: true });
    expect(loadSettings('user-1')).toEqual({ theme: 'dark', unit: 'lb', stepSmall: 2, stepLarge: 5, restCountdown: true });
    expect(loadSettings('user-2')).toEqual(DEFAULT_SETTINGS);
  });

  it('merges stored partials over defaults (forward compatibility)', () => {
    localStorage.setItem('gym-tracker-settings-user-1', JSON.stringify({ theme: 'light' }));
    expect(loadSettings('user-1')).toEqual({ ...DEFAULT_SETTINGS, theme: 'light' });
  });

  it('survives corrupted storage', () => {
    localStorage.setItem('gym-tracker-settings-user-1', '{nope');
    expect(loadSettings('user-1')).toEqual(DEFAULT_SETTINGS);
  });
});
