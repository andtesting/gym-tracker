import { describe, it, expect } from 'vitest';
import { toCSV, toJSON } from '../../src/lib/export';
import type { ExportRow } from '../../src/lib/export';

const rows: ExportRow[] = [
  {
    date: '2026-04-28',
    routine: 'back A',
    exercise: 'Machine Lat Pulldown',
    set_type: 'warmup',
    reps: 10,
    weight_kg: 25,
    set_duration_seconds: 30,
    rest_seconds: 60,
    started_at: '2026-04-28T08:00:00Z',
    completed_at: '2026-04-28T08:00:30Z',
    session_id: 's1',
    session_started_at: '2026-04-27T22:00:00Z',
    session_finished_at: '2026-04-27T23:00:00Z',
    session_notes: null,
    rpe: 8.5,
    set_notes: 'left shoulder twinge',
    group_id: 'grp-1',
    deleted_at: null,
  },
  {
    date: '2026-04-28',
    routine: 'back A',
    exercise: 'Machine Lat Pulldown',
    set_type: 'working',
    reps: 8,
    weight_kg: 52,
    set_duration_seconds: 25,
    rest_seconds: 90,
    started_at: '2026-04-28T08:01:30Z',
    completed_at: '2026-04-28T08:01:55Z',
    session_id: 's1',
    session_started_at: '2026-04-27T22:00:00Z',
    session_finished_at: '2026-04-27T23:00:00Z',
    session_notes: null,
    rpe: null,
    set_notes: null,
    group_id: null,
    deleted_at: null,
  },
  {
    date: '2026-04-28',
    routine: 'back A',
    exercise: 'Dumbbell Bicep Curl',
    set_type: 'working',
    reps: 6,
    weight_kg: 16,
    set_duration_seconds: 20,
    rest_seconds: null,
    started_at: null,
    completed_at: null,
    session_id: 's1',
    session_started_at: '2026-04-27T22:00:00Z',
    session_finished_at: '2026-04-27T23:00:00Z',
    session_notes: null,
    rpe: null,
    set_notes: null,
    group_id: null,
    deleted_at: null,
  },
];

// Second session: same routine, same local day as s1. Must NOT merge with s1
// in the JSON export (regression: the old date|routine grouping key merged them).
const secondSessionRow: ExportRow = {
  date: '2026-04-28',
  routine: 'back A',
  exercise: 'Machine Lat Pulldown',
  set_type: 'working',
  reps: 12,
  weight_kg: 40,
  set_duration_seconds: null,
  rest_seconds: null,
  started_at: null,
  completed_at: null,
  session_id: 's2',
  session_started_at: '2026-04-28T08:00:00Z',
  session_finished_at: null,
  session_notes: 'evening session',
  rpe: null,
  set_notes: null,
    group_id: null,
    deleted_at: null,
};

describe('toCSV', () => {
  it('produces correct header row', () => {
    const csv = toCSV(rows);
    const header = csv.split('\n')[0];
    expect(header).toBe('date,routine,exercise,set_type,reps,weight_kg,set_duration_seconds,rest_seconds,started_at,completed_at,session_id,session_started_at,session_finished_at,session_notes,rpe,set_notes,group_id,deleted_at');
  });

  it('produces correct data rows', () => {
    const csv = toCSV(rows);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(4); // header + 3 rows
    expect(lines[1]).toBe('2026-04-28,back A,Machine Lat Pulldown,warmup,10,25,30,60,2026-04-28T08:00:00Z,2026-04-28T08:00:30Z,s1,2026-04-27T22:00:00Z,2026-04-27T23:00:00Z,,8.5,left shoulder twinge,grp-1,');
    expect(lines[3]).toBe('2026-04-28,back A,Dumbbell Bicep Curl,working,6,16,20,,,,s1,2026-04-27T22:00:00Z,2026-04-27T23:00:00Z,,,,,');
  });

  it('returns header only for empty data', () => {
    const csv = toCSV([]);
    expect(csv.split('\n')).toHaveLength(1);
  });

  it('escapes commas in values', () => {
    const row: ExportRow[] = [{
      ...rows[0],
      exercise: 'Curl, Standing',
      session_notes: 'felt strong, heavy day',
    }];
    const csv = toCSV(row);
    expect(csv.split('\n')[1]).toContain('"Curl, Standing"');
    expect(csv.split('\n')[1]).toContain('"felt strong, heavy day"');
  });
});

describe('toJSON', () => {
  it('carries session identity and timestamps', () => {
    const json = toJSON(rows);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1); // one session
    expect(parsed[0].session_id).toBe('s1');
    expect(parsed[0].date).toBe('2026-04-28');
    expect(parsed[0].routine).toBe('back A');
    expect(parsed[0].started_at).toBe('2026-04-27T22:00:00Z');
    expect(parsed[0].finished_at).toBe('2026-04-27T23:00:00Z');
    expect(parsed[0].notes).toBeNull();
  });

  it('groups sets by exercise within a session', () => {
    const json = toJSON(rows);
    const parsed = JSON.parse(json);
    const exercises = parsed[0].exercises;
    expect(exercises).toHaveLength(2);
    expect(exercises[0].name).toBe('Machine Lat Pulldown');
    expect(exercises[0].sets).toHaveLength(2);
    expect(exercises[0].sets[0].rpe).toBe(8.5);
    expect(exercises[0].sets[0].notes).toBe('left shoulder twinge');
    expect(exercises[0].sets[0].group_id).toBe('grp-1');
    expect(exercises[0].sets[1].rpe).toBeNull();
    expect(exercises[0].sets[1].notes).toBeNull();
    expect(exercises[0].sets[1].group_id).toBeNull();
    expect(exercises[0].sets[1].deleted_at).toBeNull();
    expect(exercises[1].name).toBe('Dumbbell Bicep Curl');
    expect(exercises[1].sets).toHaveLength(1);
  });

  it('keeps two same-day same-routine sessions separate', () => {
    const json = toJSON([...rows, secondSessionRow]);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].session_id).toBe('s1');
    expect(parsed[1].session_id).toBe('s2');
    expect(parsed[1].notes).toBe('evening session');
    expect(parsed[1].exercises).toHaveLength(1);
    expect(parsed[1].exercises[0].sets).toHaveLength(1);
  });

  it('returns empty array JSON for empty data', () => {
    expect(toJSON([])).toBe('[]');
  });
});
