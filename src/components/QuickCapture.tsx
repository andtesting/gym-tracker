import { useState, useEffect, useRef } from 'react';
import { Delete } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import { unitLabel, round2 } from '../lib/units';

interface Props {
  reps: string;
  weight: string;
  onRepsChange: (value: string) => void;
  onWeightChange: (value: string) => void;
}

// Reps/weight entry without the OS keyboard (AND-47): large tap-to-edit value
// buttons, quick-adjust chips, and an in-app pad for full entry.
// Non-focusable controls mean iOS never raises its keyboard and the viewport
// never jumps mid-workout. Chips apply to whichever field is selected
// (AND-50) and step by the user-configured amounts.
export default function QuickCapture({ reps, weight, onRepsChange, onWeightChange }: Props) {
  const { settings } = useSettings();
  const [activeField, setActiveField] = useState<'reps' | 'weight' | null>(null);
  // Calculator semantics: the first digit after opening a field replaces the
  // prefilled value instead of appending to it.
  const [freshEntry, setFreshEntry] = useState(false);
  const padRef = useRef<HTMLDivElement>(null);

  // No input focus means the browser never auto-scrolls the pad into view;
  // on short viewports it would open underneath the fixed bottom bar.
  useEffect(() => {
    if (activeField) padRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeField]);

  const value = activeField === 'reps' ? reps : weight;
  const setValue = activeField === 'reps' ? onRepsChange : onWeightChange;

  function toggleField(field: 'reps' | 'weight') {
    if (activeField === field) {
      setActiveField(null);
    } else {
      setActiveField(field);
      setFreshEntry(true);
    }
  }

  function pressDigit(digit: string) {
    if (!activeField) return;
    // A bare leading zero is replaced rather than extended, so "0" then "8"
    // reads 8, not 08.
    const current = freshEntry ? '' : value;
    const base = current === '0' && digit !== '.' ? '' : current;
    setFreshEntry(false);
    if (digit === '.') {
      if (activeField === 'reps' || base.includes('.')) return;
      setValue(base === '' ? '0.' : `${base}.`);
      return;
    }
    const max = activeField === 'reps' ? 3 : 6;
    if (base.length >= max) return;
    setValue(base + digit);
  }

  function pressBackspace() {
    if (!activeField) return;
    setFreshEntry(false);
    setValue(value.slice(0, -1));
  }

  // Chips act on the selected field: reps round to a whole number and floor
  // at 1; weight keeps decimals and floors at 0.
  function nudge(delta: number) {
    if (!activeField) return;
    setFreshEntry(false);
    if (activeField === 'reps') {
      const current = parseInt(reps, 10);
      const next = Math.max(1, Math.round((isNaN(current) ? 0 : current) + delta));
      onRepsChange(String(next));
    } else {
      const current = parseFloat(weight);
      const next = Math.max(0, (isNaN(current) ? 0 : current) + delta);
      // round2 trims float noise so a nudge reads "62.5", not "62.500000001".
      onWeightChange(String(round2(next)));
    }
  }

  const steps = [
    { label: `-${settings.stepSmall}`, delta: -settings.stepSmall },
    { label: `+${settings.stepSmall}`, delta: settings.stepSmall },
    { label: `-${settings.stepLarge}`, delta: -settings.stepLarge },
    { label: `+${settings.stepLarge}`, delta: settings.stepLarge },
  ];

  return (
    <div>
      <div className="qc-values">
        <button
          className={`qc-value ${activeField === 'reps' ? 'qc-value-active' : ''}`}
          onClick={() => toggleField('reps')}
          aria-label="Edit reps"
        >
          <span className="qc-number">{reps === '' ? '·' : reps}</span>
          <span className="qc-unit">reps</span>
        </button>
        <button
          className={`qc-value ${activeField === 'weight' ? 'qc-value-active' : ''}`}
          onClick={() => toggleField('weight')}
          aria-label="Edit weight"
        >
          <span className="qc-number">{weight === '' ? '·' : weight}</span>
          <span className="qc-unit">{unitLabel(settings.unit)}</span>
        </button>
      </div>

      <div className="qc-chips">
        {steps.map(step => (
          <button
            key={step.label}
            className="qc-chip"
            onClick={() => nudge(step.delta)}
            disabled={!activeField}
            aria-label={`Adjust by ${step.label}`}
          >
            {step.label}
          </button>
        ))}
      </div>
      {!activeField && (
        <p className="text-small text-muted mt-8 text-center">
          Tap reps or {unitLabel(settings.unit)} to adjust.
        </p>
      )}

      {activeField && (
        <div className="numpad" ref={padRef}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'].map(key => (
            <button
              key={key}
              className="numpad-key"
              onClick={() => pressDigit(key)}
              disabled={key === '.' && activeField === 'reps'}
            >
              {key}
            </button>
          ))}
          <button className="numpad-key" onClick={pressBackspace} aria-label="Delete digit">
            <Delete size={20} />
          </button>
          <button className="numpad-done" onClick={() => setActiveField(null)}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
