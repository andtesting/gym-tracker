import { describe, it, expect } from 'vitest';
import { normalizeRpe } from '../../src/lib/rpe';

describe('normalizeRpe', () => {
  it('clears on empty or whitespace', () => {
    expect(normalizeRpe('')).toBeNull();
    expect(normalizeRpe('   ')).toBeNull();
  });

  it('clears on non-numeric input', () => {
    expect(normalizeRpe('hard')).toBeNull();
  });

  it('passes through valid half steps', () => {
    expect(normalizeRpe('8')).toBe(8);
    expect(normalizeRpe('8.5')).toBe(8.5);
    expect(normalizeRpe('10')).toBe(10);
    expect(normalizeRpe('1')).toBe(1);
  });

  it('snaps to the nearest half step', () => {
    expect(normalizeRpe('8.3')).toBe(8.5);
    expect(normalizeRpe('8.2')).toBe(8);
    expect(normalizeRpe('7.75')).toBe(8);
  });

  it('clamps outside 1-10 so the DB check can never reject', () => {
    expect(normalizeRpe('12')).toBe(10);
    expect(normalizeRpe('0')).toBe(1);
    expect(normalizeRpe('-3')).toBe(1);
  });
});
