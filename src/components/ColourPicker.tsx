import { PALETTE } from '../lib/palette';

interface Props {
  selected: string;
  onSelect: (colour: string) => void;
}

export default function ColourPicker({ selected, onSelect }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 8,
        padding: 12,
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius)',
      }}
    >
      {PALETTE.map(colour => (
        <div
          key={colour}
          onClick={() => onSelect(colour)}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: colour,
            border: `3px solid ${colour === selected ? '#1e293b' : 'transparent'}`,
            cursor: 'pointer',
            margin: '0 auto',
          }}
        />
      ))}
    </div>
  );
}
