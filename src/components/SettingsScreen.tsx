import { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import type { ThemePreference, WeightUnit } from '../lib/settings';

interface Props {
  onBack: () => void;
}

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const UNITS: { value: WeightUnit; label: string }[] = [
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
];

export default function SettingsScreen({ onBack }: Props) {
  const { settings, update } = useSettings();
  // Steps edit as strings and commit on blur so a half-typed "2." survives.
  const [smallText, setSmallText] = useState(String(settings.stepSmall));
  const [largeText, setLargeText] = useState(String(settings.stepLarge));

  function commitStep(key: 'stepSmall' | 'stepLarge', text: string, reset: (v: string) => void) {
    const value = parseFloat(text);
    if (isNaN(value) || value <= 0) {
      reset(String(settings[key]));
      return;
    }
    update({ [key]: value });
    reset(String(value));
  }

  return (
    <div>
      <div className="row-between mb-16">
        <button className="btn-secondary btn-small" onClick={onBack}>Back</button>
        <h1>Settings</h1>
        <div style={{ width: 48 }} />
      </div>

      <div className="settings-section">
        <h3 className="mb-16">Appearance</h3>
        <div className="toggle-group">
          {THEMES.map(t => (
            <button
              key={t.value}
              className={settings.theme === t.value ? 'active' : ''}
              onClick={() => update({ theme: t.value })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h3 className="mb-16">Weight unit</h3>
        <div className="toggle-group">
          {UNITS.map(u => (
            <button
              key={u.value}
              className={settings.unit === u.value ? 'active' : ''}
              onClick={() => update({ unit: u.value })}
            >
              {u.label}
            </button>
          ))}
        </div>
        <p className="text-small text-muted mt-8">
          Display and entry only; data is always stored in kg.
        </p>
      </div>

      <div className="settings-section">
        <h3 className="mb-16">Rest timer</h3>
        <div className="toggle-group">
          <button
            className={!settings.restCountdown ? 'active' : ''}
            onClick={() => update({ restCountdown: false })}
          >
            Count up
          </button>
          <button
            className={settings.restCountdown ? 'active' : ''}
            onClick={() => update({ restCountdown: true })}
          >
            Countdown
          </button>
        </div>
        <p className="text-small text-muted mt-8">
          Countdown runs from each exercise&apos;s rest target (120s when it has none).
          Count up turns red past 3:00.
        </p>
      </div>

      <div className="settings-section">
        <h3 className="mb-16">Quick adjust steps</h3>
        <div className="row">
          <div style={{ flex: 1 }}>
            <label className="text-small text-muted">Small (±)</label>
            <input
              type="text"
              inputMode="decimal"
              value={smallText}
              onChange={e => setSmallText(e.target.value)}
              onBlur={() => commitStep('stepSmall', smallText, setSmallText)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="text-small text-muted">Large (±)</label>
            <input
              type="text"
              inputMode="decimal"
              value={largeText}
              onChange={e => setLargeText(e.target.value)}
              onBlur={() => commitStep('stepLarge', largeText, setLargeText)}
            />
          </div>
        </div>
        <p className="text-small text-muted mt-8">
          The four chips under the number pad become ±{settings.stepSmall} and ±{settings.stepLarge},
          applied to whichever value is selected.
        </p>
      </div>
    </div>
  );
}
