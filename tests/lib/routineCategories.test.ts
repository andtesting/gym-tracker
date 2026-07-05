import { describe, it, expect } from 'vitest';
import { groupIntoCategories, nextVariantLabel, nextVariantOrder } from '../../src/lib/routineCategories';
import type { Routine } from '../../src/types';

function r(name: string, over: Partial<Routine> = {}): Routine {
  return {
    id: name, name, color: '#000',
    category: null, variant_label: null, variant_order: null,
    created_at: '2026-01-01T00:00:00Z', ...over,
  };
}

describe('groupIntoCategories', () => {
  it('groups variants under their category, in variant_order', () => {
    const routines = [
      r('Chest A', { category: 'Chest', variant_label: 'A', variant_order: 0 }),
      r('Back B', { category: 'Back', variant_label: 'B', variant_order: 1 }),
      r('Back A', { category: 'Back', variant_label: 'A', variant_order: 0 }),
      r('Chest B', { category: 'Chest', variant_label: 'B', variant_order: 1 }),
    ];
    const cats = groupIntoCategories(routines);
    expect(cats.map(c => c.name)).toEqual(['Back', 'Chest']);
    expect(cats[0].variants.map(v => v.name)).toEqual(['Back A', 'Back B']);
    expect(cats[1].variants.map(v => v.name)).toEqual(['Chest A', 'Chest B']);
  });

  it('returns an empty array for no routines', () => {
    expect(groupIntoCategories([])).toEqual([]);
  });

  it('treats a legacy routine with no category as its own single-variant category', () => {
    const cats = groupIntoCategories([r('Full Body')]);
    expect(cats).toHaveLength(1);
    expect(cats[0].name).toBe('Full Body');
    expect(cats[0].variants).toHaveLength(1);
  });

  it('orders variants with null order last', () => {
    const cats = groupIntoCategories([
      r('Legs B', { category: 'Legs', variant_order: 1 }),
      r('Legs X', { category: 'Legs', variant_order: null }),
      r('Legs A', { category: 'Legs', variant_order: 0 }),
    ]);
    expect(cats[0].variants.map(v => v.name)).toEqual(['Legs A', 'Legs B', 'Legs X']);
  });
});

describe('nextVariantLabel', () => {
  it('returns the first unused letter', () => {
    expect(nextVariantLabel([r('Legs A', { variant_label: 'A' })])).toBe('B');
    expect(nextVariantLabel([
      r('Legs A', { variant_label: 'A' }),
      r('Legs B', { variant_label: 'B' }),
    ])).toBe('C');
  });

  it('fills a gap before extending', () => {
    expect(nextVariantLabel([
      r('Legs A', { variant_label: 'A' }),
      r('Legs C', { variant_label: 'C' }),
    ])).toBe('B');
  });

  it('starts at A when only null labels exist', () => {
    expect(nextVariantLabel([r('Full Body')])).toBe('A');
  });
});

describe('nextVariantOrder', () => {
  it('is one past the max order', () => {
    expect(nextVariantOrder([
      r('a', { variant_order: 0 }),
      r('b', { variant_order: 1 }),
    ])).toBe(2);
  });

  it('starts at 0 when all orders are null', () => {
    expect(nextVariantOrder([r('a'), r('b')])).toBe(0);
  });
});
