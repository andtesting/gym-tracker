import { describe, it, expect } from 'vitest';
import { searchExercises } from '../../src/lib/search';

const exercises = [
  { id: '1', name: 'Machine Lat Pulldown' },
  { id: '2', name: 'Machine Seated Row' },
  { id: '3', name: 'Standing Dumbbell Row' },
  { id: '4', name: 'Dumbbell Bicep Curl' },
  { id: '5', name: 'Hammer Curl' },
  { id: '6', name: 'Barbell Bench Press' },
];

describe('searchExercises', () => {
  it('returns all exercises for empty query', () => {
    expect(searchExercises(exercises, '')).toEqual(exercises);
  });

  it('returns all exercises for whitespace query', () => {
    expect(searchExercises(exercises, '   ')).toEqual(exercises);
  });

  it('matches substring case-insensitively', () => {
    const result = searchExercises(exercises, 'dumbbell row');
    expect(result).toEqual([{ id: '3', name: 'Standing Dumbbell Row' }]);
  });

  it('matches partial word', () => {
    const result = searchExercises(exercises, 'curl');
    expect(result).toHaveLength(2);
    expect(result.map(e => e.name)).toEqual(['Dumbbell Bicep Curl', 'Hammer Curl']);
  });

  it('matches prefix', () => {
    const result = searchExercises(exercises, 'machine');
    expect(result).toHaveLength(2);
  });

  it('returns empty array for no matches', () => {
    const result = searchExercises(exercises, 'deadlift');
    expect(result).toEqual([]);
  });

  it('is case-insensitive', () => {
    const result = searchExercises(exercises, 'BENCH');
    expect(result).toEqual([{ id: '6', name: 'Barbell Bench Press' }]);
  });
});
