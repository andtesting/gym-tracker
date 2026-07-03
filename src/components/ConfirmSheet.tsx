interface Props {
  title: string;
  message?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// In-app replacement for window.confirm: a bottom action sheet that renders
// in-theme instead of the browser's origin-labelled modal. Tapping the
// backdrop cancels.
export default function ConfirmSheet({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <div className="confirm-sheet" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        {message && <p className="text-small text-muted mt-8">{message}</p>}
        <button className="btn-danger mt-16" style={{ width: '100%' }} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button className="btn-secondary mt-8" style={{ width: '100%' }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
