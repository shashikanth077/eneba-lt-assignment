import { ChevronLeft, ChevronRight } from 'lucide-react';
import { classNames } from '../../../utils/classNames';
import styles from './Pagination.module.scss';

interface PaginationProps {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}

/** 1 … 4 5 [6] 7 8 … 20: always the first, the last, and two on each side of the current page. */
function visiblePages(page: number, count: number): (number | 'gap')[] {
  const wanted = new Set(
    [1, count, page - 2, page - 1, page, page + 1, page + 2].filter((n) => n >= 1 && n <= count),
  );
  const sorted = [...wanted].sort((a, b) => a - b);
  const result: (number | 'gap')[] = [];
  sorted.forEach((n, index) => {
    if (index > 0 && n - sorted[index - 1] > 1) result.push('gap');
    result.push(n);
  });
  return result;
}

export function Pagination({ page, pageCount, onChange }: PaginationProps) {
  if (pageCount <= 1) return null;
  return (
    <nav className={styles.nav} aria-label="pagination">
      <ul className={styles.list}>
        <li>
          <button
            type="button"
            className={styles.item}
            aria-label="Go to previous page"
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
          >
            <ChevronLeft aria-hidden />
          </button>
        </li>
        {visiblePages(page, pageCount).map((item, index) =>
          item === 'gap' ? (
            <li key={`gap-${index}`} className={styles.gap} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                className={classNames(styles.item, item === page && styles.current)}
                aria-label={item === page ? `page ${item}` : `Go to page ${item}`}
                aria-current={item === page ? 'page' : undefined}
                onClick={() => onChange(item)}
              >
                {item}
              </button>
            </li>
          ),
        )}
        <li>
          <button
            type="button"
            className={styles.item}
            aria-label="Go to next page"
            disabled={page >= pageCount}
            onClick={() => onChange(page + 1)}
          >
            <ChevronRight aria-hidden />
          </button>
        </li>
      </ul>
    </nav>
  );
}
