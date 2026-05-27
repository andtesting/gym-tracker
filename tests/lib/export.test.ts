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
  },
];

describe('toCSV', () => {
  it('produces correct header row', () => {
    const csv = toCSV(rows);
    const header = csv.split('\n')[0];
    expect(header).toBe('date,routine,exercise,set_type,reps,weight_kg,set_duration_seconds,rest_seconds,started_at,completed_at');
  });

  it('produces correct data rows', () => {
    const csv = toCSV(rows);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(4); // header + 3 rows
    expect(lines[1]).toBe('2026-04-28,back A,Machine Lat Pulldown,warmup,10,25,30,60,2026-04-28T08:00:00Z,2026-04-28T08:00:30Z');
    expect(lines[3]).toBe('2026-04-28,back A,Dumbbell Bicep Curl,working,6,16,20,,,');
  });

  it('returns header only for empty data', () => {
    const csv = toCSV([]);
    expect(csv.split('\n')).toHaveLength(1);
  });

  it('escapes commas in values', () => {
    const row: ExportRow[] = [{
      date: '2026-04-28',
      routine: 'back A',
      exercise: 'Curl, Standing',
      set_type: 'working',
      reps: 6,
      weight_kg: 16,
      set_duration_seconds: null,
      rest_seconds: null,
      started_at: null,
      completed_at: null,
    }];
    const csv = toCSV(row);
    expect(csv.split('\n')[1]).toContain('"Curl, Standing"');
  });
});

describe('toJSON', () => {
  it('groups by session date and routine', () => {
    const json = toJSON(rows);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1); // one session
    expect(parsed[0].date).toBe('2026-04-28');
    expect(parsed[0].routine).toBe('back A');
  });

  it('groups sets by exercise within a session', () => {
    const json = toJSON(rows);
    const parsed = JSON.parse(json);
    const exercises = parsed[0].exercises;
    expect(exercises).toHaveLength(2);
    expect(exercises[0].name).toBe('Machine Lat Pulldown');
    expect(exercises[0].sets).toHaveLength(2);
    expect(exercises[1].name).toBe('Dumbbell Bicep Curl');
    expect(exercises[1].sets).toHaveLength(1);
  });

  it('returns empty array JSON for empty data', () => {
    expect(toJSON([])).toBe('[]');
  });
});
