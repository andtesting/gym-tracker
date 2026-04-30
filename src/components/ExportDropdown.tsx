import { useState, useEffect, useRef } from 'react';

interface Props {
  onExport: (format: 'csv' | 'json') => void;
}

export default function ExportDropdown({ onExport }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  function handleExport(format: 'csv' | 'json') {
    setOpen(false);
    onExport(format);
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button className="btn-secondary" onClick={() => setOpen(prev => !prev)}>
        Export
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 4,
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            zIndex: 20,
            overflow: 'hidden',
            minWidth: 120,
          }}
        >
          <button
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 16px',
              background: 'none',
              border: 'none',
              borderBottom: '1px solid var(--color-border)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onClick={() => handleExport('csv')}
          >
            CSV
          </button>
          <button
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 16px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onClick={() => handleExport('json')}
          >
            JSON
          </button>
        </div>
      )}
    </div>
  );
}
