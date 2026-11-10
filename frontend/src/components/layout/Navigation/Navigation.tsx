import { LayoutGrid } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { fetchFacetsRequest } from '../../../features/products/productsSlice';
import { selectFacetsEntry } from '../../../features/products/productsSelectors';
import { classNames } from '../../../utils/classNames';
import { Menu, MenuItem, Skeleton } from '../../common';
import { PageContainer } from '../PageContainer';
import styles from './Navigation.module.scss';

/** Fixed shortcuts: they are routes of the app, not catalogue content. */
const SHORTCUTS = [
  { label: 'All games', to: '/store' },
  { label: 'Deals', to: '/store?sort=discount' },
  { label: 'New releases', to: '/store?sort=newest' },
];

/**
 * The bar under the header. Platforms and categories (genres) come from GET /api/filters, so they always match what the catalogue
 * really holds. If that request fails the bar still works with the fixed shortcuts. On a phone it scrolls sideways.
 */
export function Navigation() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  useEffect(() => {
    dispatch(fetchFacetsRequest('')); // the whole catalogue; shared with the store page's price bounds
  }, [dispatch]);
  const entry = useAppSelector(selectFacetsEntry(''));
  const data = entry?.data;
  const here = location.pathname + location.search;

  const links = [
    ...SHORTCUTS,
    ...(data?.platforms ?? []).map((platform) => ({
      label: platform.label,
      to: `/store?platform=${encodeURIComponent(platform.value)}`,
    })),
  ];

  return (
    <nav className={styles.nav} aria-label="Categories and platforms">
      <PageContainer>
        <div className={styles.row}>
          <Menu
            align="left"
            trigger={(props) => (
              <button
                type="button"
                className={styles.categories}
                disabled={!data || data.genres.length === 0}
                {...props}
              >
                <LayoutGrid size={18} aria-hidden /> Categories
              </button>
            )}
          >
            {(data?.genres ?? []).map((genre) => (
              <MenuItem key={genre.value} to={`/store?genre=${encodeURIComponent(genre.value)}`}>
                {genre.label}
              </MenuItem>
            ))}
          </Menu>
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={classNames(styles.link, here === link.to && styles.current)}
              aria-current={here === link.to ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
          {entry === undefined || (entry.status === 'loading' && !data)
            ? [72, 64, 80].map((width) => (
                <Skeleton key={width} className={styles.skeleton} style={{ width }} />
              ))
            : null}
        </div>
      </PageContainer>
    </nav>
  );
}
