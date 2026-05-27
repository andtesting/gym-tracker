import { Fragment } from 'react';

interface SetData {
  set_order: number;
  reps: number;
  weight_kg: number;
}

interface DataPoint {
  started_at: string;
  sets: SetData[];
}

interface Props {
  data: DataPoint[];
  mode: 'weight' | 'reps';
}

const COL_WIDTH = 46;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export default function TrendsChart({ data, mode }: Props) {
  if (data.length === 0) {
    return <p className="text-muted text-center mt-16">No data for this exercise yet.</p>;
  }

  const maxSets = Math.max(...data.map(d => d.sets.length));
  const allValues = data.flatMap(d =>
    d.sets.map(s => (mode === 'weight' ? s.weight_kg : s.reps)),
  );
  const maxValue = Math.max(...allValues, 1);
  const maxBarHeight = 60;

  // Resolve a set at a given row for a given session column.
  const setAt = (col: number, row: number): SetData | undefined =>
    data[col].sets.find(s => s.set_order === row + 1) ?? data[col].sets[row];

  const primaryOf = (s: SetData) => (mode === 'weight' ? s.weight_kg : s.reps);

  return (
    <div style={{ overflowX: 'auto' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `28px repeat(${data.length}, ${COL_WIDTH}px)`,
          gap: 6,
          width: 'max-content',
        }}
      >
        <div />
        {data.map((dp, col) => (
          <div key={col} className="trends-date">
            {formatDate(dp.started_at)}
          </div>
        ))}

        {Array.from({ length: maxSets }, (_, row) => (
          <Fragment key={`row-${row}`}>
            <div
              style={{
                fontSize: '0.7rem',
                color: 'var(--color-muted)',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                paddingBottom: 2,
              }}
            >
              S{row + 1}
            </div>
            {data.map((_dp, col) => {
              const set = setAt(col, row);
              if (!set) {
                return <div key={`${row}-${col}`} style={{ height: maxBarHeight + 34 }} />;
              }
              const primary = primaryOf(set);
              const secondary = mode === 'weight' ? set.reps : set.weight_kg;
              const barHeight = Math.max((primary / maxValue) * maxBarHeight, 2);

              // Colour the bar by change vs the previous session at this set row.
              const prevSet = col > 0 ? setAt(col - 1, row) : undefined;
              let barColour = 'var(--color-accent)';
              if (prevSet) {
                const prev = primaryOf(prevSet);
                if (primary > prev) barColour = 'var(--color-success)';
                else if (primary < prev) barColour = 'var(--color-danger)';
              }

              return (
                <div
                  key={`${row}-${col}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    height: maxBarHeight + 34,
                  }}
                >
                  <div className="trends-value">
                    {primary}
                    {mode === 'weight' ? 'kg' : 'r'}
                  </div>
                  <div
                    className="trends-bar"
                    style={{ height: barHeight, background: barColour, width: '100%' }}
                  />
                  <div className="trends-value">
                    {secondary > 0 ? `${secondary}${mode === 'weight' ? 'r' : 'kg'}` : ''}
                  </div>
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
