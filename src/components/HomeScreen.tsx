import { useState, useEffect } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { fetchRecentSessions, fetchHeatmapSessions, fetchExportSets, fetchRecentVolumeSets } from '../api/sessions';
import { fetchRoutines } from '../api/routines';
import { signOut } from '../hooks/useAuth';
import { saveActiveWorkout, loadActiveWorkout } from '../lib/sessionPersistence';
import { toCSV, toJSON } from '../lib/export';
import { localDateKey } from '../lib/date';
import { cachedFetch } from '../lib/cache';
import { weeklyStreak, compareWeeks, nextUpRoutine } from '../lib/stats';
import { kgToDisplay, unitLabel } from '../lib/units';
import { useSync } from '../hooks/useSync';
import { useSettings } from '../hooks/useSettings';
import type { ExportRow } from '../lib/export';
import type { VolumeSetRow } from '../api/sessions';
import type { SessionWithRoutine, HeatmapSession, Screen, Routine } from '../types';
import ActivityHeatmap from './ActivityHeatmap';
import ExportDropdown from './ExportDropdown';
import DayDetailSheet from './DayDetailSheet';
import { useToast } from '../hooks/useToast';

interface Props {
  onNavigate: (screen: Screen) => void;
}

export default function HomeScreen({ onNavigate }: Props) {
  const [sessions, setSessions] = useState<SessionWithRoutine[]>([]);
  const [heatmapSessions, setHeatmapSessions] = useState<HeatmapSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popoverDate, setPopoverDate] = useState<string | null>(null);
  const toast = useToast();
  const pendingSync = useSync();
  const { settings } = useSettings();
  const [volumeRows, setVolumeRows] = useState<VolumeSetRow[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  // The server session list can't know about an offline-started workout;
  // the local record is the way back in.
  const [localWorkout] = useState(() => loadActiveWorkout());

  const sessionsForPopover = popoverDate
    ? heatmapSessions.filter(s => localDateKey(s.started_at) === popoverDate)
    : [];

  useEffect(() => {
    const now = new Date();
    const start = new Date(now);
    // Pad the fetch window a day on each side: the bounds are UTC-derived but
    // the heatmap buckets/renders by LOCAL date, so without the pad a session on
    // the edge day could fall outside the UTC bound and be dropped (AND-38).
    start.setDate(start.getDate() - 85);
    const end = new Date(now);
    end.setDate(end.getDate() + 1);
    const startDate = start.toISOString().split('T')[0];
    const endDate = end.toISOString().split('T')[0] + 'T23:59:59';

    // Two weeks back (plus the same UTC-vs-local pad) covers the week
    // comparison; stats are decoration, so their failures stay silent.
    const volumeSince = new Date(now);
    volumeSince.setDate(volumeSince.getDate() - 15);

    Promise.all([
      fetchRecentSessions(14),
      fetchHeatmapSessions(startDate, endDate),
    ])
      .then(([recent, heatmap]) => {
        setSessions(recent);
        setHeatmapSessions(heatmap);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));

    fetchRecentVolumeSets(volumeSince.toISOString().split('T')[0]).then(setVolumeRows).catch(() => {});
    cachedFetch('routines', fetchRoutines).then(setRoutines).catch(() => {});
  }, []);

  const todayKey = localDateKey(new Date().toISOString());
  const streak = weeklyStreak(heatmapSessions.map(s => localDateKey(s.started_at)), todayKey);
  const weekCmp = compareWeeks(
    volumeRows.map(r => ({ reps: r.reps, weight_kg: r.weight_kg, dateKey: localDateKey(r.sessions.started_at) })),
    todayKey,
  );
  const nextUp = nextUpRoutine(routines, heatmapSessions.map(s => ({ routine_id: s.routine_id, started_at: s.started_at })));
  const tonnageDelta = weekCmp.lastWeek.tonnageKg > 0
    ? Math.round(((weekCmp.thisWeek.tonnageKg - weekCmp.lastWeek.tonnageKg) / weekCmp.lastWeek.tonnageKg) * 100)
    : null;

  async function handleExport(format: 'csv' | 'json') {
    let exportSets;
    try {
      exportSets = await fetchExportSets();
    } catch {
      toast('Export failed. Check your connection and try again.');
      return;
    }
    const rows: ExportRow[] = exportSets.map(set => ({
      date: localDateKey(set.sessions.started_at),
      routine: set.sessions.routines?.name ?? 'Unnamed Routine',
      exercise: set.exercises?.name ?? 'Unnamed Exercise',
      set_type: set.set_type,
      reps: set.reps,
      weight_kg: set.weight_kg,
      set_duration_seconds: set.set_duration_seconds,
      rest_seconds: set.rest_seconds,
      started_at: set.started_at,
      completed_at: set.completed_at,
      session_id: set.sessions.id,
      session_started_at: set.sessions.started_at,
      session_finished_at: set.sessions.finished_at,
      session_notes: set.sessions.notes,
    }));

    const content = format === 'csv' ? toCSV(rows) : toJSON(rows);
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gym-tracker-export.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  }

  return (
    <div>
      <div className="header-bar">
        <h1>Gym Tracker</h1>
        <div className="row">
          {pendingSync > 0 && (
            <span className="text-small" style={{ color: 'var(--color-warning)' }}>
              Syncing {pendingSync}…
            </span>
          )}
          <button
            className="btn-secondary btn-small"
            onClick={() => onNavigate({ name: 'settings' })}
            aria-label="Settings"
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <SettingsIcon size={16} />
          </button>
          <button className="btn-secondary btn-small" onClick={() => onNavigate({ name: 'editMode' })}>Edit</button>
          <button className="btn-secondary btn-small" onClick={signOut}>Logout</button>
        </div>
      </div>

      {localWorkout && (
        <div
          className="session-list-item"
          style={{ borderLeft: '3px solid var(--color-warning)' }}
          onClick={() => onNavigate({
            name: 'activeWorkout',
            sessionId: localWorkout.sessionId,
            routineId: localWorkout.routineId,
            routineName: localWorkout.routineName,
          })}
        >
          <div className="row-between">
            <strong>Resume {localWorkout.routineName}</strong>
            <span className="text-small" style={{ color: 'var(--color-warning)' }}>In progress</span>
          </div>
        </div>
      )}

      {loading && <p className="text-muted text-center mt-16">Loading...</p>}
      {error && <p className="text-center mt-16" style={{ color: 'var(--color-danger)' }}>{error}</p>}

      {!loading && (
        <ActivityHeatmap
          sessions={heatmapSessions}
          onCellClick={(date) => setPopoverDate(date)}
        />
      )}

      {!loading && heatmapSessions.length > 0 && (
        <div className="summary-stats">
          <div className="summary-stat">
            <span className="summary-stat-value">{streak}wk</span>
            <span className="summary-stat-label">streak</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-value">{weekCmp.thisWeek.sets}</span>
            <span className="summary-stat-label">sets this wk</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-value">
              {Math.round(kgToDisplay(weekCmp.thisWeek.tonnageKg, settings.unit)).toLocaleString()}
            </span>
            <span className="summary-stat-label">
              {unitLabel(settings.unit)} this wk
              {tonnageDelta !== null && (
                <span style={{ color: tonnageDelta >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {' '}{tonnageDelta >= 0 ? '+' : ''}{tonnageDelta}%
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      {!loading && nextUp && !localWorkout && (
        <p
          className="text-small text-muted mt-8"
          style={{ cursor: 'pointer' }}
          onClick={() => onNavigate({ name: 'pickRoutine' })}
        >
          Next up: <strong style={{ color: 'var(--color-text)' }}>{nextUp.name}</strong> (longest since trained)
        </p>
      )}

      {popoverDate && (
        <DayDetailSheet
          date={popoverDate}
          sessions={sessionsForPopover}
          onClose={() => setPopoverDate(null)}
          onNavigate={onNavigate}
        />
      )}

      {!loading && sessions.length === 0 && (
        <p className="text-muted text-center mt-16">No workouts yet. Start your first one!</p>
      )}

      <div className="mt-16">
        {sessions.filter(s => s.id !== localWorkout?.sessionId).map(session => (
          <div
            key={session.id}
            className="session-list-item"
            onClick={() => {
              if (!session.finished_at && session.routines) {
                const workout = {
                  sessionId: session.id,
                  routineId: session.routine_id!,
                  routineName: session.routines.name,
                };
                // Never clobber an existing local record: it may hold
                // unsynced sets and timer anchors for this same session.
                if (loadActiveWorkout()?.sessionId !== session.id) {
                  saveActiveWorkout(workout);
                }
                onNavigate({ name: 'activeWorkout', ...workout });
              } else {
                onNavigate({ name: 'sessionDetail', sessionId: session.id });
              }
            }}
          >
            <div className="row-between">
              <div className="row" style={{ gap: 8 }}>
                {session.routines && (
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: session.routines.color,
                      flexShrink: 0,
                    }}
                  />
                )}
                <strong>{session.routines?.name ?? 'Unnamed Routine'}</strong>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {!session.finished_at && (
                  <span className="text-small" style={{ color: 'var(--color-warning)' }}>In progress</span>
                )}
                <span className="text-small text-muted">{formatDate(session.started_at)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bottom-bar-two-row">
        <div className="row">
          <div style={{ flex: 1 }}>
            <ExportDropdown onExport={handleExport} />
          </div>
          <button
            className="btn-secondary"
            style={{ flex: 1 }}
            onClick={() => onNavigate({ name: 'trends' })}
          >
            View Trends
          </button>
        </div>
        <button className="btn-primary" onClick={() => onNavigate({ name: 'pickRoutine' })}>
          Start Workout
        </button>
        <button
          className="btn-secondary"
          style={{ width: '100%' }}
          onClick={() => onNavigate({ name: 'logPastWorkout' })}
        >
          Log past workout
        </button>
      </div>
    </div>
  );
}
