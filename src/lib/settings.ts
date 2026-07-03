export type ThemePreference = 'system' | 'light' | 'dark';
export type WeightUnit = 'kg' | 'lb';

export interface Settings {
  theme: ThemePreference;
  unit: WeightUnit;
  // Quick-adjust chip steps, in the user's display unit.
  stepSmall: number;
  stepLarge: number;
  // Rest counts down against the exercise's rest target (120s default when
  // the exercise has none). Off = count up, going loud past 3 minutes.
  restCountdown: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  unit: 'kg',
  stepSmall: 1,
  stepLarge: 2.5,
  restCountdown: false,
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

const THEME_BG = { light: '#ffffff', dark: '#121316' } as const;

// 'system' removes the override so the prefers-color-scheme media query
// rules apply; an explicit choice pins the matching variable block. The
// theme-color metas only follow the OS, so an explicit choice must pin them
// too or the iOS status bar keeps the opposite colour.
export function applyTheme(theme: ThemePreference): void {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (theme === 'system') {
    delete document.documentElement.dataset.theme;
    metas.forEach(m => {
      const media = m.getAttribute('media') ?? '';
      m.content = media.includes('dark') ? THEME_BG.dark : THEME_BG.light;
    });
  } else {
    document.documentElement.dataset.theme = theme;
    metas.forEach(m => { m.content = THEME_BG[theme]; });
  }
}
