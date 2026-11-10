import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { classNames } from '../../../utils/classNames';
import styles from './Menu.module.scss';

const CloseContext = createContext<() => void>(() => undefined);

interface MenuProps {
  /** Renders the button that opens the menu; spread `props` on it (aria-haspopup, aria-expanded, onClick, ref). */
  trigger: (props: {
    ref: React.RefObject<HTMLButtonElement | null>;
    onClick: () => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls': string | undefined;
  }) => ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
}

/**
 * A dropdown menu: role="menu" with role="menuitem" children, opened by a button. Arrow keys move between items, Escape or a click
 * outside closes it and returns focus to the button, choosing an item closes it.
 */
export function Menu({ trigger, children, align = 'right' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: MouseEvent) => {
      if (
        !list.current?.contains(event.target as Node) &&
        !button.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className={styles.wrap}>
      {trigger({
        ref: button,
        onClick: () => setOpen((current) => !current),
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
      })}
      {open && (
        <CloseContext.Provider value={() => close(false)}>
          <div
            ref={list}
            id={menuId}
            role="menu"
            className={classNames(styles.menu, align === 'left' && styles.left)}
            onKeyDown={onKeyDown}
          >
            {children}
          </div>
        </CloseContext.Provider>
      )}
    </div>
  );
}

export function MenuItem({
  to,
  onClick,
  children,
}: {
  to?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const close = useContext(CloseContext);
  if (to !== undefined) {
    return (
      <Link to={to} role="menuitem" className={styles.item} onClick={close}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      className={styles.item}
      onClick={() => {
        close();
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

export function MenuHeader({ children }: { children: ReactNode }) {
  return (
    <div role="presentation" style={{ padding: '8px 16px' }}>
      {children}
    </div>
  );
}

export const MenuDivider = () => <div role="separator" className={styles.divider} />;
