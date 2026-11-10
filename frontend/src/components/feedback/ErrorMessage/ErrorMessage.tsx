import { CircleAlert } from 'lucide-react';
import { describeApiError } from '../../../services/api/apiErrorHandler';
import type { SerializedApiError } from '../../../types/common.types';
import { Button } from '../../common';
import styles from '../state.module.scss';

interface ErrorMessageProps {
  /** The stored API error; turned into a readable sentence. Omit for the generic message. */
  error?: SerializedApiError | null;
  title?: string;
  /** When given, a "Try again" button is shown. */
  onRetry?: () => void;
  minHeight?: number | string;
}

/** The full-width error state of a screen or block: what went wrong in words, and a way to try again. */
export function ErrorMessage({
  error,
  title = 'Something went wrong',
  onRetry,
  minHeight,
}: ErrorMessageProps) {
  return (
    <div
      className={`${styles.state} ${styles.error}`}
      role="alert"
      style={minHeight === undefined ? undefined : { minHeight }}
    >
      <CircleAlert size={48} className={styles.icon} aria-hidden />
      <h2>{title}</h2>
      <p className={styles.description}>{describeApiError(error)}</p>
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
    </div>
  );
}
