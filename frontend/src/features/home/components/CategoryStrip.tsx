import {
  Gamepad2,
  Joystick,
  LayoutGrid,
  Monitor,
  Swords,
  Tag,
  Tv,
  type LucideIcon,
} from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { Skeleton } from '../../../components/common';
import { ErrorMessage } from '../../../components/feedback/ErrorMessage';
import { blockQueryPath, parseCategories } from '../blocks';
import type { BlockProps } from '../homeTypes';
import { fetchHomeBlockRequest, selectHomeBlock } from '../homeSlice';
import styles from './CategoryStrip.module.scss';

/** The picture of each shortcut: the backend sends a plain key, the browser chooses the icon. An unknown key still gets one. */
const ICONS: Record<string, LucideIcon> = {
  games: Gamepad2,
  steam: Monitor,
  playstation: Tv,
  xbox: Joystick,
  'nintendo-switch': Swords,
  genre: Tag,
};

/** Renderer for blocks of type "shortcuts": the row of category links under the banner (data: GET /api/home/categories). */
export function CategoryStrip({ block }: BlockProps) {
  const dispatch = useAppDispatch();
  const path = blockQueryPath(block.endpoint);
  useEffect(() => {
    if (path !== null) dispatch(fetchHomeBlockRequest(path));
  }, [dispatch, path]);
  const entry = useAppSelector(selectHomeBlock(path ?? ''));

  if (path === null)
    return <ErrorMessage title={`${block.title} is misconfigured`} minHeight={96} />;
  if (entry?.data === undefined) {
    return entry?.status === 'failed' ? null : (
      <Skeleton style={{ height: 96 }} aria-label="Loading categories" />
    );
  }
  const items = parseCategories(entry.data);
  if (items.length === 0) return null;

  return (
    <nav aria-label={block.title}>
      <ul className={styles.strip}>
        {items.map((item) => {
          const Icon = ICONS[item.icon] ?? LayoutGrid;
          return (
            <li key={item.id} className={styles.item}>
              <Link to={item.to} className={styles.link}>
                <Icon aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
