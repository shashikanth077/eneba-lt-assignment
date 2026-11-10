import type { InputHTMLAttributes } from 'react';
import styles from './Checkbox.module.scss';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> {
  label: string;
  /** How many results this option would give; shown after the label. */
  count?: number;
}

export function Checkbox({ label, count, ...rest }: CheckboxProps) {
  return (
    <label className={styles.label}>
      <input {...rest} type="checkbox" className={styles.box} />
      <span className={styles.text}>
        <span>{label}</span>
        {count !== undefined && <span className={styles.count}>{count}</span>}
      </span>
    </label>
  );
}
