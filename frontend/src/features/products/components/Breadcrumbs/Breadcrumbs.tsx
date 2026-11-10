import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import styles from './Breadcrumbs.module.scss';

export interface Crumb {
  label: string;
  /** Omit on the last crumb: it is the current page. */
  to?: string;
}

/** Store > Steam > Game name. The current page is marked with aria-current and is not a link. */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className={styles.list}>
        {crumbs.map((crumb, index) => (
          <li key={crumb.label} className={styles.item}>
            {crumb.to ? (
              <Link to={crumb.to} className={styles.link}>
                {crumb.label}
              </Link>
            ) : (
              <span className={styles.current} aria-current="page">
                {crumb.label}
              </span>
            )}
            {index < crumbs.length - 1 && <ChevronRight size={16} aria-hidden />}
          </li>
        ))}
      </ol>
    </nav>
  );
}
