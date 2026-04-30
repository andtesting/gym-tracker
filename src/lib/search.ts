interface Searchable {
  id: string;
  name: string;
}

export function searchExercises<T extends Searchable>(items: T[], query: string): T[] {
  const trimmed = query.trim();
  if (!trimmed) return items;
  const lower = trimmed.toLowerCase();
  return items.filter(item => item.name.toLowerCase().includes(lower));
}
