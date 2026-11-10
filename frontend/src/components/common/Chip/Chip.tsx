import { X } from 'lucide-react';
import { classNames } from '../../../utils/classNames';
import styles from './Chip.module.scss';

interface ChipProps {
  label: string;
  /** When given, the chip gets a remove button named "Remove <label>". */
  onRemove?: () => void;
}

export function Chip({ label, onRemove }: ChipProps) {
  return (
    <span className={classNames(styles.chip, !onRemove && styles.plain)}>
      {label}
      {onRemove && (
        <button
          type="button"
          className={styles.remove}
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          <X size={16} aria-hidden />
        </button>
      )}
    </span>
  );
}
