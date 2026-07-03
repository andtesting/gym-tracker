import type { TimerMode } from '../lib/timer';
import { restCountdown, REST_ALARM_SECONDS } from '../lib/timer';

interface Props {
  mode: TimerMode;
  elapsed: number;
  // Countdown target while resting (per-exercise target or the 120s default);
  // null = count up, with the alarm style past REST_ALARM_SECONDS.
  restTargetSeconds?: number | null;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TimerDisplay({ mode, elapsed, restTargetSeconds }: Props) {
  const countdown =
    mode === 'rest' && restTargetSeconds != null && restTargetSeconds > 0
      ? restCountdown(elapsed, restTargetSeconds)
      : null;
  const alarm = mode === 'rest' && !countdown && elapsed >= REST_ALARM_SECONDS;
  return (
    <div className="timer-sticky">
      {mode === 'idle' && <span className="timer-idle">Ready</span>}
      {mode === 'rest' && (
        <span className={`timer-rest ${alarm ? 'timer-rest-alarm' : ''}`}>
          Rest: {formatTime(elapsed)}
          {countdown && (
            <span className={countdown.over ? 'timer-countdown-over' : 'timer-countdown'}>
              {' · '}{countdown.text}
            </span>
          )}
        </span>
      )}
      {mode === 'set' && <span className="timer-set">Set: {formatTime(elapsed)}</span>}
    </div>
  );
}
