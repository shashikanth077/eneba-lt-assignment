import type { ReactNode } from 'react';
import styles from './authForm.module.scss';

/** The sign-in / sign-up screen: a headline on the dark page, and the form panel beside it. */
export function AuthCard({
  title,
  headline,
  children,
}: {
  title: string;
  headline: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <p className={styles.headline} aria-hidden="true">
        {headline}
      </p>
      <div className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        {children}
      </div>
    </div>
  );
}
