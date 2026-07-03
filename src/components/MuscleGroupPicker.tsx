import { useState } from 'react';
import type { MuscleGroup } from '../types';
import { useToast } from '../hooks/useToast';

interface Props {
  groups: MuscleGroup[];
  selected: string | null;
  onSelect: (groupId: string) => void;
  onCreateGroup: (name: string) => Promise<MuscleGroup>;
}

export default function MuscleGroupPicker({ groups, selected, onSelect, onCreateGroup }: Props) {
  const [showInput, setShowInput] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const group = await onCreateGroup(trimmed);
      onSelect(group.id);
      setNewName('');
      setShowInput(false);
    } catch {
      toast('Failed to create muscle group.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {groups.map(group => (
          <button
            key={group.id}
            className={`btn-small ${group.id === selected ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onSelect(group.id)}
          >
            {group.name}
          </button>
        ))}
        {!showInput && (
          <button
            className="btn-small btn-secondary"
            onClick={() => setShowInput(true)}
          >
            + New Group
          </button>
        )}
      </div>
      {showInput && (
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Group name"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          />
          <button
            className="btn-small btn-primary"
            onClick={handleAdd}
            disabled={creating || !newName.trim()}
          >
            {creating ? 'Adding...' : 'Add'}
          </button>
          <button
            className="btn-small btn-secondary"
            onClick={() => { setShowInput(false); setNewName(''); }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
