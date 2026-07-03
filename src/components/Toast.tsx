import { useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { ToastContext } from '../hooks/useToast';
import type { ShowToast, ToastAction } from '../hooks/useToast';

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; action?: ToastAction } | null>(null);
  const timerRef = useRef<number | null>(null);

  const show = useCallback<ShowToast>((message, action) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setToast({ message, action });
    timerRef.current = window.setTimeout(() => setToast(null), 6000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="toast" role="alert">
          <span>{toast.message}</span>
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => {
                if (timerRef.current !== null) clearTimeout(timerRef.current);
                setToast(null);
                toast.action!.onClick();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}
