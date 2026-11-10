import type { ReactNode } from 'react';
import styles from './Sidebar.module.scss';

/** The docked side panel of a page (the store's filters on wide screens). Narrow screens put the same content in a Modal drawer instead. */
export function Sidebar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <aside className={styles.sidebar} aria-label={label}>
      {children}
    </aside>
  );
}
