import { useState } from 'react';
import { Delete } from 'lucide-react';

interface Props {
  reps: string;
  weight: string;
  onRepsChange: (value: string) => void;
  onWeightChange: (value: string) => void;
}

// Trims float noise and trailing zeros so chip nudges read "62.5", not
// "62.50000000000001".
function formatWeight(n: number): string {
  return String(Math.round(n * 100) / 100);
}

// Reps/weight entry without the OS keyboard (AND-47): large tap-to-edit value
// buttons, nudge chips for the common deltas, and an in-app pad for full
// entry. Non-focusable controls mean iOS never raises its keyboard and the
// viewport never jumps mid-workout.
export default function QuickCapture({ reps, weight, onRepsChange, onWeightChange }: Props) {
  const [activeField, setActiveField] = useState<'reps' | 'weight' | null>(null);
  // Calculator semantics: the first digit after opening a field replaces the
  // prefilled value instead of appending to it.
  const [freshEntry, setFreshEntry] = useState(false);

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
    const base = freshEntry ? '' : value;
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

  function nudgeReps(delta: number) {
    const current = parseInt(reps, 10);
    const next = Math.max(1, (isNaN(current) ? 0 : current) + delta);
    onRepsChange(String(next));
    setFreshEntry(false);
  }

  function nudgeWeight(delta: number) {
    const current = parseFloat(weight);
    const next = Math.max(0, (isNaN(current) ? 0 : current) + delta);
    onWeightChange(formatWeight(next));
    setFreshEntry(false);
  }

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
          <span className="qc-unit">kg</span>
        </button>
      </div>

      <div className="qc-chips">
        <button className="qc-chip" onClick={() => nudgeReps(-1)} aria-label="One rep less">-1</button>
        <button className="qc-chip" onClick={() => nudgeReps(1)} aria-label="One rep more">+1</button>
        <button className="qc-chip" onClick={() => nudgeWeight(-2.5)} aria-label="2.5 kg less">-2.5</button>
        <button className="qc-chip" onClick={() => nudgeWeight(2.5)} aria-label="2.5 kg more">+2.5</button>
      </div>

      {activeField && (
        <div className="numpad">
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
