import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { classNames } from '../../../utils/classNames';
import styles from './Modal.module.scss';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** `drawer` slides in from the left at 90% width (the mobile filter panel); `center` is a plain dialog. */
  variant?: 'center' | 'drawer';
  children: ReactNode;
  footer?: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

/**
 * An accessible dialog: role="dialog" + aria-modal, labelled by its title, Escape and a click on the backdrop close it, focus moves in
 * when it opens, Tab stays inside, and focus goes back to what opened it when it closes.
 */
export function Modal({ open, onClose, title, variant = 'center', children, footer }: ModalProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      returnTo.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className={classNames(styles.backdrop, variant === 'drawer' ? styles.drawer : styles.center)}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={classNames(
          styles.panel,
          variant === 'drawer' ? styles.panelDrawer : styles.panelCenter,
        )}
        onKeyDown={onKeyDown}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.close}
            aria-label={`Close ${title.toLowerCase()}`}
            onClick={onClose}
          >
            <X aria-hidden />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer}
      </div>
    </div>,
    document.body,
  );
}
