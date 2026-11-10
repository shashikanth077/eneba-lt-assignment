import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from '../state.module.scss';

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Usually a button or link that gets the person out of the dead end. */
  action?: ReactNode;
  minHeight?: number | string;
}

export function EmptyState({ title, description, action, minHeight }: EmptyStateProps) {
  return (
    <div className={styles.state} style={minHeight === undefined ? undefined : { minHeight }}>
      <Inbox size={48} className={styles.icon} aria-hidden />
      <h2>{title}</h2>
      {description && <p className={styles.description}>{description}</p>}
      {action}
    </div>
  );
}
