import { X, Plus } from 'lucide-react';
import type { HeatmapSession, Screen } from '../types';

interface Props {
  date: string;
  sessions: HeatmapSession[];
  onClose: () => void;
  onNavigate: (screen: Screen) => void;
}

function formatDateHeader(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function DayDetailSheet({ date, sessions, onClose, onNavigate }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Day detail"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-bg)',
          width: '100%',
          maxWidth: 480,
          maxHeight: '70dvh',
          borderRadius: '12px 12px 0 0',
          padding: 16,
          overflowY: 'auto',
          boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.15)',
        }}
      >
        <div className="row-between mb-16">
          <h2>{formatDateHeader(date)}</h2>
          <button
            className="btn-secondary btn-small"
            onClick={onClose}
            aria-label="Close"
            style={{ padding: 6, minHeight: 36 }}
          >
            <X size={16} />
          </button>
        </div>

        {sessions.length === 0 ? (
          <p className="text-muted text-small">No workout logged on this day.</p>
        ) : (
          <div className="stack mb-16">
            {sessions.map(s => (
              <button
                key={s.id}
                className="btn-secondary"
                style={{ textAlign: 'left' }}
                onClick={() => {
                  onClose();
                  onNavigate({ name: 'sessionDetail', sessionId: s.id });
                }}
              >
                <div className="row" style={{ gap: 8 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: s.routines?.color ?? 'var(--color-muted)',
                    flexShrink: 0,
                  }} />
                  <strong>{s.routines?.name ?? 'Unnamed routine'}</strong>
                  <span className="text-small text-muted" style={{ marginLeft: 'auto' }}>
                    Open →
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        <button
          className="btn-secondary"
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          onClick={() => {
            onClose();
            onNavigate({ name: 'logPastWorkout', date });
          }}
        >
          <Plus size={14} />
          Log {sessions.length === 0 ? 'a' : 'another'} workout on this day
        </button>
      </div>
    </div>
  );
}
