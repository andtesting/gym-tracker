import type { TimerMode } from '../lib/timer';

interface Props {
  mode: TimerMode;
  elapsed: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TimerDisplay({ mode, elapsed }: Props) {
  return (
    <div className="timer-sticky">
      {mode === 'idle' && <span className="timer-idle">Ready</span>}
      {mode === 'rest' && <span className="timer-rest">Rest: {formatTime(elapsed)}</span>}
      {mode === 'set' && <span className="timer-set">Set: {formatTime(elapsed)}</span>}
    </div>
  );
}
