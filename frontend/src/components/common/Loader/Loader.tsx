import type { CSSProperties } from 'react';
import { classNames } from '../../../utils/classNames';
import styles from './Loader.module.scss';

/** A spinner with a label for screen readers. `inline` is just the spinner, for inside buttons and alerts. */
export function Loader({
  label = 'Loading…',
  inline = false,
}: {
  label?: string;
  inline?: boolean;
}) {
  if (inline)
    return <span className={classNames(styles.spinner, styles.small)} aria-hidden="true" />;
  return (
    <div className={styles.center} role="status" aria-label={label}>
      <div className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/** A grey placeholder block shaped like the content that is loading. Decorative: the container says "loading" for everyone. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={classNames(styles.skeleton, className)} style={style} aria-hidden="true" />
  );
}
