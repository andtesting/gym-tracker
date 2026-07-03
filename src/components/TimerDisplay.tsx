import type { TimerMode } from '../lib/timer';
import { restCountdown } from '../lib/timer';

interface Props {
  mode: TimerMode;
  elapsed: number;
  // Active exercise's target_rest_seconds; rest counts down against it (AND-6).
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
  return (
    <div className="timer-sticky">
      {mode === 'idle' && <span className="timer-idle">Ready</span>}
      {mode === 'rest' && (
        <span className="timer-rest">
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
