import { useState, useEffect, useRef } from 'react';
import { fetchExercises, createExercise } from '../api/exercises';
import { fetchMuscleGroups, createMuscleGroup } from '../api/muscleGroups';
import { searchExercises } from '../lib/search';
import type { Exercise, MuscleGroup } from '../types';
import MuscleGroupPicker from './MuscleGroupPicker';

interface Props {
  onSelect: (exercise: Exercise) => void;
  primaryMuscleGroupId?: string | null;
}

export default function ExerciseSearch({ onSelect, primaryMuscleGroupId }: Props) {
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([fetchExercises(), fetchMuscleGroups()]).then(([ex, mg]) => {
      setAllExercises(ex);
      setGroups(mg);
    });
  }, []);

  const trimmedQuery = query.trim();
  const results = searchExercises(allExercises, query);
  const exactMatch = allExercises.some(e => e.name.toLowerCase() === trimmedQuery.toLowerCase());

  const sortedGroups = [...groups].sort((a, b) => {
    if (primaryMuscleGroupId) {
      if (a.id === primaryMuscleGroupId && b.id !== primaryMuscleGroupId) return -1;
      if (b.id === primaryMuscleGroupId && a.id !== primaryMuscleGroupId) return 1;
    }
    return a.name.localeCompare(b.name);
  });

  const grouped = new Map<string, Exercise[]>();
  const ungrouped: Exercise[] = [];
  for (const ex of (trimmedQuery ? results : allExercises)) {
    if (ex.muscle_group_id) {
      const arr = grouped.get(ex.muscle_group_id) || [];
      arr.push(ex);
      grouped.set(ex.muscle_group_id, arr);
    } else {
      ungrouped.push(ex);
    }
  }

  function handleSelect(exercise: Exercise) {
    setQuery('');
    setShowResults(false);
    setPendingName(null);
    onSelect(exercise);
  }

  async function handleCreateWithMuscleGroup(muscleGroupId: string) {
    if (!pendingName) return;
    setCreating(true);
    try {
      const exercise = await createExercise(pendingName, muscleGroupId);
      setAllExercises(prev => [...prev, exercise].sort((a, b) => a.name.localeCompare(b.name)));
      handleSelect(exercise);
    } finally {
      setCreating(false);
    }
  }

  if (pendingName) {
    return (
      <div className="mb-16">
        <p className="mb-16">
          Pick a muscle group for <strong>{pendingName}</strong>:
        </p>
        <MuscleGroupPicker
          groups={sortedGroups}
          selected={null}
          onSelect={handleCreateWithMuscleGroup}
          onCreateGroup={async name => {
            const g = await createMuscleGroup(name, groups.length + 1);
            setGroups(prev => [...prev, g]);
            return g;
          }}
        />
        {creating && <p className="text-muted mt-8">Creating...</p>}
        <button
          className="btn-secondary btn-small mt-8"
          onClick={() => setPendingName(null)}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="mb-16">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setShowResults(true); }}
        onFocus={() => setShowResults(true)}
        placeholder="Search or add exercise..."
      />
      {showResults && (
        <div className="search-results mt-8" style={{ maxHeight: 300 }}>
          {trimmedQuery ? (
            <>
              {results.map(exercise => (
                <div
                  key={exercise.id}
                  className="search-result-item"
                  onClick={() => handleSelect(exercise)}
                >
                  <span>{exercise.name}</span>
                  <span className="text-small text-muted" style={{ marginLeft: 'auto', paddingLeft: 8 }}>
                    {exercise.muscle_groups?.name ?? 'Other'}
                  </span>
                </div>
              ))}
              {!exactMatch && trimmedQuery && (
                <div
                  className="search-result-item search-result-new"
                  onClick={() => setPendingName(trimmedQuery)}
                >
                  {`+ Create "${trimmedQuery}"`}
                </div>
              )}
            </>
          ) : (
            <>
              {sortedGroups.map(g => {
                const exs = grouped.get(g.id);
                if (!exs || exs.length === 0) return null;
                return (
                  <div key={g.id}>
                    <div style={{
                      padding: '8px 12px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--color-muted)',
                      textTransform: 'uppercase',
                      background: 'var(--color-surface)',
                      position: 'sticky',
                      top: 0,
                    }}>
                      {g.name}
                    </div>
                    {exs.map(exercise => (
                      <div
                        key={exercise.id}
                        className="search-result-item"
                        onClick={() => handleSelect(exercise)}
                      >
                        {exercise.name}
                      </div>
                    ))}
                  </div>
                );
              })}
              {ungrouped.length > 0 && (
                <div>
                  <div style={{
                    padding: '8px 12px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--color-muted)',
                    textTransform: 'uppercase',
                    background: 'var(--color-surface)',
                    position: 'sticky',
                    top: 0,
                  }}>
                    Other
                  </div>
                  {ungrouped.map(exercise => (
                    <div
                      key={exercise.id}
                      className="search-result-item"
                      onClick={() => handleSelect(exercise)}
                    >
                      {exercise.name}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
