import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { fetchRoutines, createRoutine, updateRoutine, deleteRoutine } from '../api/routines';
import { fetchExercises, updateExercise, deleteExercise } from '../api/exercises';
import { fetchMuscleGroups, createMuscleGroup, updateMuscleGroup, deleteMuscleGroup } from '../api/muscleGroups';
import { fetchRoutineExercises, addRoutineExercise, updateRoutineExercise, deleteRoutineExercise } from '../api/routineExercises';
import type { Routine, Exercise, MuscleGroup, RoutineExerciseWithExercise } from '../types';
import { useSettings } from '../hooks/useSettings';
import { useToast } from '../hooks/useToast';
import { formatWeight, displayToKg, unitLabel } from '../lib/units';
import ColourPicker from './ColourPicker';
import MuscleGroupPicker from './MuscleGroupPicker';
import ConfirmSheet from './ConfirmSheet';
import ExerciseSearch from './ExerciseSearch';

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
  const [confirm, setConfirm] = useState<{ title: string; message: string; label: string; action: () => void } | null>(null);
  // Routine template editor (AND-6): one routine's plan open at a time.
  const [planFor, setPlanFor] = useState<string | null>(null);
  const [planItems, setPlanItems] = useState<RoutineExerciseWithExercise[]>([]);
  const { settings } = useSettings();
  const toast = useToast();

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

  function handleDeleteRoutine(id: string) {
    setConfirm({
      title: 'Delete routine?',
      message: 'Sessions using it will show as Unnamed Routine.',
      label: 'Delete routine',
      action: async () => {
        setConfirm(null);
        await deleteRoutine(id);
        setRoutines(prev => prev.filter(r => r.id !== id));
      },
    });
  }

  async function togglePlan(routineId: string) {
    if (planFor === routineId) {
      setPlanFor(null);
      setPlanItems([]);
      return;
    }
    try {
      const items = await fetchRoutineExercises(routineId);
      setPlanFor(routineId);
      setPlanItems(items);
    } catch {
      toast('Failed to load routine plan.');
    }
  }

  async function handleAddToPlan(exercise: Exercise) {
    if (!planFor) return;
    // ExerciseSearch can mint a brand-new exercise; reflect it in the
    // Exercises section below without a remount.
    setExercises(prev => (prev.some(e => e.id === exercise.id) ? prev : [...prev, exercise]));
    if (planItems.some(p => p.exercise_id === exercise.id)) {
      toast('Already in this plan.');
      return;
    }
    const nextOrder = planItems.reduce((max, p) => Math.max(max, p.sort_order), 0) + 1;
    try {
      const item = await addRoutineExercise(planFor, exercise.id, nextOrder);
      setPlanItems(prev => [...prev, item]);
    } catch {
      toast('Failed to add exercise to plan.');
    }
  }

  // Reindex the whole list from array position instead of swapping the two
  // stored values: rows written by outside actors (the Layer 2 coach) can
  // carry duplicate sort_orders, and a swap of equal values silently reverts.
  async function handlePlanReorder(index: number, direction: 'up' | 'down') {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= planItems.length) return;
    const next = [...planItems];
    [next[index], next[target]] = [next[target], next[index]];
    const reindexed = next.map((p, i) => ({ ...p, sort_order: i + 1 }));
    try {
      await Promise.all(
        reindexed
          .filter((p, i) => p.sort_order !== next[i].sort_order)
          .map(p => updateRoutineExercise(p.id, { sort_order: p.sort_order })),
      );
      setPlanItems(reindexed);
    } catch {
      toast('Failed to reorder plan.');
    }
  }

  async function handleRemoveFromPlan(id: string) {
    try {
      await deleteRoutineExercise(id);
      setPlanItems(prev => prev.filter(p => p.id !== id));
    } catch {
      toast('Failed to remove exercise from plan.');
    }
  }

  // Blank clears a target. Sets/reps/rest parse as whole numbers; weight is
  // entered in the display unit and stored in kg like everywhere else.
  async function handleTargetChange(
    item: RoutineExerciseWithExercise,
    field: 'target_sets' | 'target_reps' | 'target_rest_seconds' | 'target_weight_kg',
    raw: string,
  ) {
    const trimmed = raw.trim();
    let value: number | null;
    if (trimmed === '') {
      value = null;
    } else if (field === 'target_weight_kg') {
      const n = parseFloat(trimmed);
      if (isNaN(n) || n < 0) {
        toast('Targets must be numbers.');
        return;
      }
      value = displayToKg(n, settings.unit);
    } else {
      const n = parseInt(trimmed, 10);
      if (isNaN(n) || n <= 0) {
        toast('Targets must be positive whole numbers.');
        return;
      }
      value = n;
    }
    if (value === item[field]) return;
    try {
      await updateRoutineExercise(item.id, { [field]: value });
      setPlanItems(prev => prev.map(p => (p.id === item.id ? { ...p, [field]: value } : p)));
    } catch {
      toast('Failed to save target.');
    }
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

  function handleDeleteExercise(id: string) {
    setConfirm({
      title: 'Delete exercise?',
      message: 'Sets using it will show as Unnamed Exercise.',
      label: 'Delete exercise',
      action: async () => {
        setConfirm(null);
        await deleteExercise(id);
        setExercises(prev => prev.filter(e => e.id !== id));
      },
    });
  }

  async function handleGroupNameChange(id: string, name: string) {
    await updateMuscleGroup(id, { name });
    setGroups(prev => prev.map(g => (g.id === id ? { ...g, name } : g)));
  }

  async function handleGroupReorder(id: string, direction: 'up' | 'down') {
    const sorted = [...groups].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex(g => g.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const a = sorted[idx];
    const b = sorted[swapIdx];
    await Promise.all([
      updateMuscleGroup(a.id, { sort_order: b.sort_order }),
      updateMuscleGroup(b.id, { sort_order: a.sort_order }),
    ]);
    setGroups(prev =>
      prev.map(g => {
        if (g.id === a.id) return { ...g, sort_order: b.sort_order };
        if (g.id === b.id) return { ...g, sort_order: a.sort_order };
        return g;
      }),
    );
  }

  function handleDeleteGroup(id: string) {
    setConfirm({
      title: 'Delete group?',
      message: 'Exercises will move to Other.',
      label: 'Delete group',
      action: async () => {
        setConfirm(null);
        await deleteMuscleGroup(id);
        setGroups(prev => prev.filter(g => g.id !== id));
        setExercises(prev =>
          prev.map(e =>
            e.muscle_group_id === id ? { ...e, muscle_group_id: null, muscle_groups: null } : e,
          ),
        );
      },
    });
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

  const sortedGroups = [...groups].sort((a, b) => a.sort_order - b.sort_order);

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
                className="btn-small btn-secondary"
                style={{ minHeight: 0, padding: '4px 8px' }}
                onClick={() => togglePlan(routine.id)}
              >
                Plan
              </button>
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
            {planFor === routine.id && (
              <div className="plan-editor">
                {planItems.length === 0 && (
                  <p className="text-small text-muted">No planned exercises yet. Add below; targets are optional.</p>
                )}
                {planItems.map((item, idx) => (
                  <div key={item.id} className="plan-editor-item">
                    <div className="edit-row">
                      <div className="row" style={{ gap: 4 }}>
                        <button
                          className="btn-small btn-secondary"
                          style={{ padding: '4px', minHeight: 0, lineHeight: 0 }}
                          onClick={() => handlePlanReorder(idx, 'up')}
                          disabled={idx === 0}
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          className="btn-small btn-secondary"
                          style={{ padding: '4px', minHeight: 0, lineHeight: 0 }}
                          onClick={() => handlePlanReorder(idx, 'down')}
                          disabled={idx === planItems.length - 1}
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                      <span style={{ flex: 1, fontSize: '0.875rem' }}>{item.exercises?.name ?? 'Unnamed Exercise'}</span>
                      <button
                        className="btn-small"
                        style={{ color: 'var(--color-danger)', background: 'none', minHeight: 0, padding: '4px 8px' }}
                        onClick={() => handleRemoveFromPlan(item.id)}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="plan-targets">
                      <label>
                        Sets
                        <input
                          type="text"
                          inputMode="numeric"
                          defaultValue={item.target_sets ?? ''}
                          onBlur={e => handleTargetChange(item, 'target_sets', e.target.value)}
                        />
                      </label>
                      <label>
                        Reps
                        <input
                          type="text"
                          inputMode="numeric"
                          defaultValue={item.target_reps ?? ''}
                          onBlur={e => handleTargetChange(item, 'target_reps', e.target.value)}
                        />
                      </label>
                      <label>
                        {unitLabel(settings.unit)}
                        <input
                          type="text"
                          inputMode="decimal"
                          defaultValue={item.target_weight_kg == null ? '' : formatWeight(item.target_weight_kg, settings.unit)}
                          onBlur={e => handleTargetChange(item, 'target_weight_kg', e.target.value)}
                        />
                      </label>
                      <label>
                        Rest s
                        <input
                          type="text"
                          inputMode="numeric"
                          defaultValue={item.target_rest_seconds ?? ''}
                          onBlur={e => handleTargetChange(item, 'target_rest_seconds', e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                ))}
                <ExerciseSearch onSelect={handleAddToPlan} />
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
        {sortedGroups.map((group, idx) => (
          <div key={group.id} className="edit-row">
            <div className="row" style={{ gap: 4 }}>
              <button
                className="btn-small btn-secondary"
                style={{ padding: '4px', minHeight: 0, lineHeight: 0 }}
                onClick={() => handleGroupReorder(group.id, 'up')}
                disabled={idx === 0}
              >
                <ChevronUp size={14} />
              </button>
              <button
                className="btn-small btn-secondary"
                style={{ padding: '4px', minHeight: 0, lineHeight: 0 }}
                onClick={() => handleGroupReorder(group.id, 'down')}
                disabled={idx === sortedGroups.length - 1}
              >
                <ChevronDown size={14} />
              </button>
            </div>
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
      {confirm && (
        <ConfirmSheet
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.label}
          onConfirm={confirm.action}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
