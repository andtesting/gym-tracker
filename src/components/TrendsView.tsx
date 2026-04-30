import { useState, useEffect } from 'react';
import { fetchExercises } from '../api/exercises';
import { fetchExerciseTrends } from '../api/sessions';
import { fetchMuscleGroups } from '../api/muscleGroups';
import type { Exercise, MuscleGroup } from '../types';
import TrendsChart from './TrendsChart';

interface Props {
  onBack: () => void;
}

interface TrendData {
  started_at: string;
  sets: { set_order: number; reps: number; weight_kg: number }[];
}

export default function TrendsView({ onBack }: Props) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [mode, setMode] = useState<'weight' | 'reps'>('weight');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([fetchExercises(), fetchMuscleGroups()]).then(([ex, mg]) => {
      setExercises(ex);
      setGroups(mg);
    });
  }, []);

  async function handleSelect(exerciseId: string) {
    setSelectedId(exerciseId);
    if (!exerciseId) {
      setTrendData([]);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchExerciseTrends(exerciseId, 8);
      setTrendData(data);
    } catch {
      setTrendData([]);
    } finally {
      setLoading(false);
    }
  }

  const grouped = new Map<string, Exercise[]>();
  const ungrouped: Exercise[] = [];
  for (const ex of exercises) {
    if (ex.muscle_group_id) {
      const arr = grouped.get(ex.muscle_group_id) || [];
      arr.push(ex);
      grouped.set(ex.muscle_group_id, arr);
    } else {
      ungrouped.push(ex);
    }
  }

  return (
    <div>
      <div className="row-between mb-16">
        <button className="btn-secondary btn-small" onClick={onBack}>Back</button>
        <h1>Trends</h1>
        <div style={{ width: 48 }} />
      </div>

      <select
        value={selectedId}
        onChange={e => handleSelect(e.target.value)}
        className="mb-16"
      >
        <option value="">Select an exercise...</option>
        {groups.map(g => {
          const exs = grouped.get(g.id);
          if (!exs || exs.length === 0) return null;
          return (
            <optgroup key={g.id} label={g.name}>
              {exs.map(ex => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </optgroup>
          );
        })}
        {ungrouped.length > 0 && (
          <optgroup label="Other">
            {ungrouped.map(ex => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </optgroup>
        )}
      </select>

      {selectedId && (
        <div className="toggle-group mb-16">
          <button
            className={mode === 'weight' ? 'active' : ''}
            onClick={() => setMode('weight')}
          >
            Weight
          </button>
          <button
            className={mode === 'reps' ? 'active' : ''}
            onClick={() => setMode('reps')}
          >
            Reps
          </button>
        </div>
      )}

      {loading && <p className="text-muted text-center">Loading...</p>}

      {!loading && selectedId && (
        <TrendsChart data={trendData} mode={mode} />
      )}
    </div>
  );
}
