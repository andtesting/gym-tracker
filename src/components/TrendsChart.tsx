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

  return (
    <div style={{ overflowX: 'auto' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `auto repeat(${data.length}, 1fr)`,
          gap: 4,
          minWidth: data.length * 50,
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
            {data.map((dp, col) => {
              const set = dp.sets.find(s => s.set_order === row + 1) ?? dp.sets[row];
              if (!set) {
                return <div key={`${row}-${col}`} style={{ height: maxBarHeight + 20 }} />;
              }
              const primary = mode === 'weight' ? set.weight_kg : set.reps;
              const secondary = mode === 'weight' ? set.reps : set.weight_kg;
              const barHeight = Math.max((primary / maxValue) * maxBarHeight, 2);

              return (
                <div
                  key={`${row}-${col}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    height: maxBarHeight + 20,
                  }}
                >
                  <div
                    className="trends-bar"
                    style={{ height: barHeight }}
                  />
                  <div className="trends-value">
                    {secondary > 0 ? secondary : ''}
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
