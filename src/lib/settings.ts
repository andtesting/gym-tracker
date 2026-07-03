export type ThemePreference = 'system' | 'light' | 'dark';
export type WeightUnit = 'kg' | 'lb';

export interface Settings {
  theme: ThemePreference;
  unit: WeightUnit;
  // Quick-adjust chip steps, in the user's display unit.
  stepSmall: number;
  stepLarge: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  unit: 'kg',
  stepSmall: 1,
  stepLarge: 2.5,
};

// Keyed per user id so profiles on a shared device keep their own settings;
// localOwner's account-switch quarantine deliberately leaves these alone.
function storageKey(userId: string): string {
  return `gym-tracker-settings-${userId}`;
}

export function loadSettings(userId: string): Settings {
  const raw = localStorage.getItem(storageKey(userId));
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // Merge over defaults so settings added in later versions pick up their
    // default instead of reading undefined.
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(userId: string, settings: Settings): void {
  localStorage.setItem(storageKey(userId), JSON.stringify(settings));
}

// 'system' removes the override so the prefers-color-scheme media query
// rules apply; an explicit choice pins the matching variable block.
export function applyTheme(theme: ThemePreference): void {
  if (theme === 'system') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
}
