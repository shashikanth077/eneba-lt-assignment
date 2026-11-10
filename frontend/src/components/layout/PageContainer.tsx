import type { ReactNode } from 'react';
import { classNames } from '../../utils/classNames';
import styles from './PageContainer.module.scss';

/** The centred 1440px column used by the header, the nav bar, the page content and the footer, so everything lines up. */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={classNames(styles.container, className)}>{children}</div>;
}
