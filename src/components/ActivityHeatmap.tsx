import { Fragment } from 'react';
import type { HeatmapSession } from '../types';
import { UNNAMED_COLOUR, NO_WORKOUT_COLOUR } from '../lib/palette';
import { localDateKey } from '../lib/date';

interface Props {
  sessions: HeatmapSession[];
  onCellClick?: (date: string) => void;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const ROW_LABELS = ['M', '', 'W', '', 'F', '', 'S'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NUM_WEEKS = 12;

export default function ActivityHeatmap({ sessions, onCellClick }: Props) {
  // Build colour lookup: date string -> colour (first session wins)
  const colourMap = new Map<string, string>();
  for (const s of sessions) {
    const dateKey = localDateKey(s.started_at);
    if (!colourMap.has(dateKey)) {
      colourMap.set(dateKey, s.routines ? s.routines.color : UNNAMED_COLOUR);
    }
  }

  // Build 12 weeks: mondays[0] is 11 weeks ago, mondays[11] is current week
  const today = new Date();
  const currentMonday = getMonday(today);
  const mondays: Date[] = [];
  for (let i = NUM_WEEKS - 1; i >= 0; i--) {
    const m = new Date(currentMonday);
    m.setDate(m.getDate() - i * 7);
    mondays.push(m);
  }

  // Month labels: show abbreviated month at the first week where the month appears
  const monthLabels: (string | null)[] = [];
  let lastMonth = -1;
  for (const monday of mondays) {
    const month = monday.getMonth();
    if (month !== lastMonth) {
      monthLabels.push(MONTH_NAMES[month]);
      lastMonth = month;
    } else {
      monthLabels.push(null);
    }
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `auto repeat(${NUM_WEEKS}, 1fr)`,
      gap: '2px',
      maxWidth: '480px',
    }}>
      {/* Top-left empty cell (above row labels, left of month labels) */}
      <div />

      {/* Month labels row */}
      {monthLabels.map((label, colIdx) => (
        <div key={`month-${colIdx}`} style={{
          fontSize: '10px',
          color: '#6b7280',
          textAlign: 'left',
          lineHeight: '1',
          paddingBottom: '2px',
          whiteSpace: 'nowrap',
        }}>
          {label ?? ''}
        </div>
      ))}

      {/* Grid rows: 7 days (Mon=0 through Sun=6) */}
      {ROW_LABELS.map((label, rowIdx) => (
        <Fragment key={`row-${rowIdx}`}>
          {/* Row label */}
          <div style={{
            fontSize: '10px',
            color: '#6b7280',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: '4px',
            lineHeight: '1',
          }}>
            {label}
          </div>

          {/* Day cells for this row across all weeks */}
          {mondays.map((monday, colIdx) => {
            const cellDate = new Date(monday);
            cellDate.setDate(cellDate.getDate() + rowIdx);
            const dateKey = formatDate(cellDate);
            const isFuture = cellDate > today;
            const colour = isFuture
              ? 'transparent'
              : (colourMap.get(dateKey) ?? NO_WORKOUT_COLOUR);

            return (
              <button
                key={`cell-${colIdx}-${rowIdx}`}
                title={dateKey}
                onClick={isFuture || !onCellClick ? undefined : () => onCellClick(dateKey)}
                disabled={isFuture}
                aria-label={dateKey}
                style={{
                  aspectRatio: '1',
                  borderRadius: '2px',
                  backgroundColor: colour,
                  minWidth: 0,
                  minHeight: 0,
                  padding: 0,
                  border: 'none',
                  cursor: isFuture || !onCellClick ? 'default' : 'pointer',
                }}
              />
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
