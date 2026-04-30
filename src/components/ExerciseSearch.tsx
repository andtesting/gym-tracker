import { useState, useEffect, useRef } from 'react';
import { fetchExercises, createExercise } from '../api/exercises';
import { searchExercises } from '../lib/search';
import type { Exercise } from '../types';

interface Props {
  onSelect: (exercise: Exercise) => void;
}

export default function ExerciseSearch({ onSelect }: Props) {
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchExercises().then(setAllExercises).catch(() => {});
  }, []);

  const results = searchExercises(allExercises, query);
  const trimmedQuery = query.trim();
  const exactMatch = allExercises.some(e => e.name.toLowerCase() === trimmedQuery.toLowerCase());

  function handleSelect(exercise: Exercise) {
    setQuery('');
    setShowResults(false);
    onSelect(exercise);
  }

  async function handleCreate() {
    if (!trimmedQuery || exactMatch) return;
    setCreating(true);
    try {
      const exercise = await createExercise(trimmedQuery);
      setAllExercises(prev => [...prev, exercise].sort((a, b) => a.name.localeCompare(b.name)));
      handleSelect(exercise);
    } catch {
    } finally {
      setCreating(false);
    }
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
      {showResults && trimmedQuery && (
        <div className="search-results mt-8">
          {results.map(exercise => (
            <div
              key={exercise.id}
              className="search-result-item"
              onClick={() => handleSelect(exercise)}
            >
              {exercise.name}
            </div>
          ))}
          {!exactMatch && trimmedQuery && (
            <div
              className="search-result-item search-result-new"
              onClick={handleCreate}
            >
              {creating ? 'Creating...' : `+ Create "${trimmedQuery}"`}
            </div>
          )}
          {results.length === 0 && exactMatch && (
            <div className="search-result-item text-muted">No matches</div>
          )}
        </div>
      )}
    </div>
  );
}
