import React from 'react';
import { X } from 'lucide-react';
import { SessionLabel, DEFAULT_SESSION_LABELS } from '../types';

interface LabelBadgeProps {
  labelId: string;
  onRemove?: () => void;
  size?: 'sm' | 'md';
  customLabels?: SessionLabel[];
}

const LabelBadge: React.FC<LabelBadgeProps> = ({
  labelId,
  onRemove,
  size = 'sm',
  customLabels,
}) => {
  const allLabels = customLabels || DEFAULT_SESSION_LABELS;
  const label = allLabels.find((l) => l.id === labelId);

  if (!label) return null;

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5 gap-0.5',
    md: 'text-xs px-2 py-1 gap-1',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClasses[size]}`}
      style={{
        backgroundColor: `${label.color}20`,
        color: label.color,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: label.color }}
      />
      <span>{label.name}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:bg-black/10 rounded-full p-0.5 -mr-0.5 transition-colors"
        >
          <X size={size === 'sm' ? 10 : 12} />
        </button>
      )}
    </span>
  );
};

export default LabelBadge;
