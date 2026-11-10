import type { ReactNode } from 'react';
import { classNames } from '../../../utils/classNames';
import styles from './Alert.module.scss';

interface AlertProps {
  severity: 'info' | 'success' | 'warning' | 'error';
  children: ReactNode;
  /** A button or link that deals with the problem. */
  action?: ReactNode;
  /** "alert" interrupts the screen reader (use for errors the person must notice); "status" waits for a pause. */
  role?: 'alert' | 'status';
  icon?: ReactNode;
}

export function Alert({ severity, children, action, role, icon }: AlertProps) {
  return (
    <div
      className={classNames(styles.alert, styles[severity])}
      role={role ?? (severity === 'error' ? 'alert' : undefined)}
    >
      {icon}
      <div className={styles.body}>{children}</div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
