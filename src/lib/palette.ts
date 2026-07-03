export const PALETTE = [
  '#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed',
  '#ec4899', '#0891b2', '#ea580c', '#4f46e5', '#059669',
  '#d97706', '#9333ea', '#e11d48', '#0d9488', '#c2410c',
  '#6366f1', '#65a30d', '#a21caf', '#f43f5e', '#0e7490',
  '#ca8a04', '#7e22ce', '#be123c', '#047857', '#b45309',
  '#4338ca', '#15803d', '#86198f', '#9f1239', '#155e75',
];

export const UNNAMED_COLOUR = '#94a3b8';
// CSS variable so the heatmap's empty cells follow light/dark theme.
export const NO_WORKOUT_COLOUR = 'var(--color-heatmap-empty)';

export function autoAssignColour(existingCount: number): string {
  return PALETTE[existingCount % PALETTE.length];
}
