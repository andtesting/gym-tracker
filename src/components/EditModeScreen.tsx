import { useState, useEffect } from 'react';
import { fetchRoutines, createRoutine, updateRoutine, deleteRoutine } from '../api/routines';
import { fetchExercises, updateExercise, deleteExercise } from '../api/exercises';
import { fetchMuscleGroups, createMuscleGroup, updateMuscleGroup, deleteMuscleGroup } from '../api/muscleGroups';
import type { Routine, Exercise, MuscleGroup } from '../types';
import ColourPicker from './ColourPicker';
import MuscleGroupPicker from './MuscleGroupPicker';

interface Props {
  onBack: () => void;
}

export default function EditModeScreen({ onBack }: Props) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [groups, setGroups] = useState<MuscleGroup[]>([]);
  const [colourPickerFor, setColourPickerFor] = useState<string | null>(null);
  const [musclePickerFor, setMusclePickerFor] = useState<string | null>(null);
  const [newRoutineName, setNewRoutineName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    fetchRoutines().then(setRoutines);
    fetchExercises().then(setExercises);
    fetchMuscleGroups().then(setGroups);
  }, []);

  async function handleRoutineNameChange(id: string, name: string) {
    await updateRoutine(id, { name });
    setRoutines(prev => prev.map(r => (r.id === id ? { ...r, name } : r)));
  }

  async function handleRoutineColourChange(id: string, color: string) {
    await updateRoutine(id, { color });
    setRoutines(prev => prev.map(r => (r.id === id ? { ...r, color } : r)));
    setColourPickerFor(null);
  }

  async function handleDeleteRoutine(id: string) {
    if (!window.confirm('Delete routine? Sessions using it will show as Unnamed Routine.')) return;
    await deleteRoutine(id);
    setRoutines(prev => prev.filter(r => r.id !== id));
  }

  async function handleAddRoutine() {
    const trimmed = newRoutineName.trim();
    if (!trimmed) return;
    const routine = await createRoutine(trimmed, routines.length);
    setRoutines(prev => [...prev, routine].sort((a, b) => a.name.localeCompare(b.name)));
    setNewRoutineName('');
  }

  async function handleExerciseNameChange(id: string, name: string) {
    await updateExercise(id, { name });
    setExercises(prev => prev.map(e => (e.id === id ? { ...e, name } : e)));
  }

  async function handleExerciseMuscleChange(exerciseId: string, muscleGroupId: string) {
    await updateExercise(exerciseId, { muscle_group_id: muscleGroupId });
    const group = groups.find(g => g.id === muscleGroupId) ?? null;
    setExercises(prev =>
      prev.map(e =>
        e.id === exerciseId ? { ...e, muscle_group_id: muscleGroupId, muscle_groups: group } : e,
      ),
    );
    setMusclePickerFor(null);
  }

  async function handleDeleteExercise(id: string) {
    if (!window.confirm('Delete exercise? Sets using it will show as Unnamed Exercise.')) return;
    await deleteExercise(id);
    setExercises(prev => prev.filter(e => e.id !== id));
  }

  async function handleGroupNameChange(id: string, name: string) {
    await updateMuscleGroup(id, { name });
    setGroups(prev => prev.map(g => (g.id === id ? { ...g, name } : g)));
  }

  async function handleDeleteGroup(id: string) {
    if (!window.confirm('Delete group? Exercises will move to Other.')) return;
    await deleteMuscleGroup(id);
    setGroups(prev => prev.filter(g => g.id !== id));
    setExercises(prev =>
      prev.map(e =>
        e.muscle_group_id === id ? { ...e, muscle_group_id: null, muscle_groups: null } : e,
      ),
    );
  }

  async function handleAddGroup() {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    const group = await createMuscleGroup(trimmed, groups.length + 1);
    setGroups(prev => [...prev, group]);
    setNewGroupName('');
  }

  const exercisesByGroup = new Map<string, Exercise[]>();
  const ungroupedExercises: Exercise[] = [];
  for (const ex of exercises) {
    if (ex.muscle_group_id) {
      const arr = exercisesByGroup.get(ex.muscle_group_id) || [];
      arr.push(ex);
      exercisesByGroup.set(ex.muscle_group_id, arr);
    } else {
      ungroupedExercises.push(ex);
    }
  }

  const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <div className="row-between mb-16">
        <h1>Edit</h1>
        <button className="btn-secondary btn-small" onClick={onBack}>Done</button>
      </div>

      <div className="edit-section">
        <h2 className="mb-16">Routines</h2>
        {routines.map(routine => (
          <div key={routine.id}>
            <div className="edit-row">
              <button
                className="colour-swatch"
                style={{ background: routine.color }}
                onClick={() =>
                  setColourPickerFor(colourPickerFor === routine.id ? null : routine.id)
                }
              />
              <input
                className="edit-input"
                defaultValue={routine.name}
                onBlur={e => {
                  const val = e.target.value.trim();
                  if (val && val !== routine.name) handleRoutineNameChange(routine.id, val);
                }}
              />
              <button
                className="btn-small"
                style={{ color: 'var(--color-danger)', background: 'none', minHeight: 0, padding: '4px 8px' }}
                onClick={() => handleDeleteRoutine(routine.id)}
              >
                Delete
              </button>
            </div>
            {colourPickerFor === routine.id && (
              <div style={{ padding: '8px 0' }}>
                <ColourPicker
                  selected={routine.color}
                  onSelect={c => handleRoutineColourChange(routine.id, c)}
                />
              </div>
            )}
          </div>
        ))}
        <div className="row mt-8">
          <input
            className="edit-input"
            value={newRoutineName}
            onChange={e => setNewRoutineName(e.target.value)}
            placeholder="New routine name"
            onKeyDown={e => e.key === 'Enter' && handleAddRoutine()}
          />
          <button className="btn-primary btn-small" onClick={handleAddRoutine}>Add</button>
        </div>
      </div>

      <div className="edit-section">
        <h2 className="mb-16">Exercises</h2>
        {sortedGroups.map(group => {
          const exs = exercisesByGroup.get(group.id);
          if (!exs || exs.length === 0) return null;
          return (
            <div key={group.id} className="mb-16">
              <h3 className="text-muted text-small mb-16" style={{ textTransform: 'uppercase' }}>
                {group.name}
              </h3>
              {exs.map(ex => (
                <div key={ex.id}>
                  <div className="edit-row">
                    <input
                      className="edit-input"
                      defaultValue={ex.name}
                      onBlur={e => {
                        const val = e.target.value.trim();
                        if (val && val !== ex.name) handleExerciseNameChange(ex.id, val);
                      }}
                    />
                    <button
                      className="muscle-badge"
                      onClick={() =>
                        setMusclePickerFor(musclePickerFor === ex.id ? null : ex.id)
                      }
                    >
                      {ex.muscle_groups?.name ?? 'Other'}
                    </button>
                    <button
                      className="btn-small"
                      style={{ color: 'var(--color-danger)', background: 'none', minHeight: 0, padding: '4px 8px' }}
                      onClick={() => handleDeleteExercise(ex.id)}
                    >
                      Delete
                    </button>
                  </div>
                  {musclePickerFor === ex.id && (
                    <div style={{ padding: '8px 0' }}>
                      <MuscleGroupPicker
                        groups={sortedGroups}
                        selected={ex.muscle_group_id}
                        onSelect={gid => handleExerciseMuscleChange(ex.id, gid)}
                        onCreateGroup={async name => {
                          const g = await createMuscleGroup(name, groups.length + 1);
                          setGroups(prev => [...prev, g]);
                          return g;
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
        {ungroupedExercises.length > 0 && (
          <div className="mb-16">
            <h3 className="text-muted text-small mb-16" style={{ textTransform: 'uppercase' }}>
              Other
            </h3>
            {ungroupedExercises.map(ex => (
              <div key={ex.id}>
                <div className="edit-row">
                  <input
                    className="edit-input"
                    defaultValue={ex.name}
                    onBlur={e => {
                      const val = e.target.value.trim();
                      if (val && val !== ex.name) handleExerciseNameChange(ex.id, val);
                    }}
                  />
                  <button
                    className="muscle-badge"
                    onClick={() =>
                      setMusclePickerFor(musclePickerFor === ex.id ? null : ex.id)
                    }
                  >
                    Other
                  </button>
                  <button
                    className="btn-small"
                    style={{ color: 'var(--color-danger)', background: 'none', minHeight: 0, padding: '4px 8px' }}
                    onClick={() => handleDeleteExercise(ex.id)}
                  >
                    Delete
                  </button>
                </div>
                {musclePickerFor === ex.id && (
                  <div style={{ padding: '8px 0' }}>
                    <MuscleGroupPicker
                      groups={sortedGroups}
                      selected={ex.muscle_group_id}
                      onSelect={gid => handleExerciseMuscleChange(ex.id, gid)}
                      onCreateGroup={async name => {
                        const g = await createMuscleGroup(name, groups.length + 1);
                        setGroups(prev => [...prev, g]);
                        return g;
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="edit-section">
        <h2 className="mb-16">Muscle Groups</h2>
        {sortedGroups.map((group) => (
          <div key={group.id} className="edit-row">
            <input
              className="edit-input"
              defaultValue={group.name}
              onBlur={e => {
                const val = e.target.value.trim();
                if (val && val !== group.name) handleGroupNameChange(group.id, val);
              }}
            />
            <button
              className="btn-small"
              style={{ color: 'var(--color-danger)', background: 'none', minHeight: 0, padding: '4px 8px' }}
              onClick={() => handleDeleteGroup(group.id)}
            >
              Delete
            </button>
          </div>
        ))}
        <div className="row mt-8">
          <input
            className="edit-input"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            placeholder="New group name"
            onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
          />
          <button className="btn-primary btn-small" onClick={handleAddGroup}>Add</button>
        </div>
      </div>
    </div>
  );
}
