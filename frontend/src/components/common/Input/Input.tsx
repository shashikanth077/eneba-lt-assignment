import { forwardRef, useId } from 'react';
import { classNames } from '../../../utils/classNames';
import type { InputProps } from './Input.types';
import styles from './Input.module.scss';

/** A labelled text field. Forwards its ref so React Hook Form's `register` works on it. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helperText, id, className, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const helperId = `${inputId}-helper`;
  return (
    <div className={classNames(styles.field, className)}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <input
        {...rest}
        ref={ref}
        id={inputId}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={helperId}
      />
      <p id={helperId} className={classNames(styles.helper, error && styles.error)}>
        {error ?? helperText ?? ''}
      </p>
    </div>
  );
});
