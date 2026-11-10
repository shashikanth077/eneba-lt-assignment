import type { ReactNode } from 'react';
import styles from './authForm.module.scss';

/** The narrow centred panel both the login and the register page use. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.card}>
      <h1 className={styles.title}>{title}</h1>
      {children}
    </div>
  );
}
