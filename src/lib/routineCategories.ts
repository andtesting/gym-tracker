import type { Routine, RoutineCategory } from '../types';

// The grouping key: an explicit category, else the routine's own name (a
// legacy/ungrouped routine is its own single-variant category).
function categoryKey(r: Routine): string {
  return r.category ?? r.name;
}

function variantSort(a: Routine, b: Routine): number {
  const ao = a.variant_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.variant_order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return a.name.localeCompare(b.name);
}

// Groups a flat routine list into categories, each with its variants in cycle
// order. Categories are alphabetical by name.
export function groupIntoCategories(routines: Routine[]): RoutineCategory[] {
  const byKey = new Map<string, Routine[]>();
  for (const r of routines) {
    const key = categoryKey(r);
    const list = byKey.get(key);
    if (list) list.push(r);
    else byKey.set(key, [r]);
  }
  return Array.from(byKey.entries())
    .map(([name, variants]) => ({ name, variants: [...variants].sort(variantSort) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The first unused single-letter label (A, B, C…) for a new variant in a
// category. Ignores null labels (a legacy un-suffixed routine); the new one
// simply takes the first free letter.
export function nextVariantLabel(variants: Routine[]): string {
  const used = new Set(variants.map(v => v.variant_label).filter((l): l is string => !!l));
  for (let c = 65; c <= 90; c++) {
    const label = String.fromCharCode(c);
    if (!used.has(label)) return label;
  }
  return 'X';
}

// The next cycle position for a new variant in a category.
export function nextVariantOrder(variants: Routine[]): number {
  const max = variants.reduce((m, v) => Math.max(m, v.variant_order ?? -1), -1);
  return max + 1;
}
