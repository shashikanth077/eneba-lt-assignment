import { useId, type SelectHTMLAttributes } from 'react';
import styles from './Select.module.scss';

export interface SelectOption<V extends string> {
  value: V;
  label: string;
}

interface SelectProps<V extends string> extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'onChange' | 'value'
> {
  label: string;
  value: V;
  options: SelectOption<V>[];
  onChange: (value: V) => void;
}

/** A native <select> with a visible label: the browser supplies keyboard handling, the list and the mobile picker. */
export function Select<V extends string>({
  label,
  value,
  options,
  onChange,
  ...rest
}: SelectProps<V>) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select
        {...rest}
        id={id}
        className={styles.select}
        value={value}
        onChange={(event) => onChange(event.target.value as V)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
