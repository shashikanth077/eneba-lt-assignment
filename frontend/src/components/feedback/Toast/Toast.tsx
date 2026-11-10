import { X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { dismissToast, selectToasts } from '../../../features/ui/uiSlice';
import { classNames } from '../../../utils/classNames';
import styles from './Toast.module.scss';

/** Short confirmations ("Added to cart") and failures that have no better place on the screen. Announced politely, dismissed by a saga timer. */
export function ToastRegion() {
  const toasts = useAppSelector(selectToasts);
  const dispatch = useAppDispatch();
  return (
    <div className={styles.region} role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={classNames(
            styles.toast,
            toast.type === 'error' && styles.error,
            toast.type === 'success' && styles.success,
          )}
        >
          <span className={styles.message}>{toast.message}</span>
          <button
            type="button"
            className={styles.close}
            aria-label="Dismiss notification"
            onClick={() => dispatch(dismissToast(toast.id))}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
