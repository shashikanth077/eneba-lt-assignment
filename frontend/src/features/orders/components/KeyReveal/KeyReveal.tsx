import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../../../components/common';
import { classNames } from '../../../../utils/classNames';
import styles from './KeyReveal.module.scss';

const MASK = '•••••-•••••-•••••';
type CopyState = 'idle' | 'copied' | 'failed';

/**
 * One game key, hidden until the buyer asks for it (so it is not on screen for a bystander or in a screenshot of the page), with a
 * button that copies it. The key lives only in this component's props: it is not written to storage, the URL or the logs.
 */
export function KeyReveal({ value, label }: { value: string; label: string }) {
  const [shown, setShown] = useState(false);
  const [copy, setCopy] = useState<CopyState>('idle');

  useEffect(() => {
    if (copy === 'idle') return;
    const timer = setTimeout(() => setCopy('idle'), 2500);
    return () => clearTimeout(timer);
  }, [copy]);

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopy('copied');
    } catch {
      // No clipboard permission (or an insecure page): the key is selectable text, so it can still be copied by hand.
      setCopy('failed');
    }
  };

  return (
    <div className={styles.row}>
      <code
        className={classNames(styles.key, shown ? styles.selectable : styles.hidden)}
        aria-label={shown ? `${label}: ${value}` : `${label}: hidden`}
      >
        {shown ? value : MASK}
      </code>
      <Button
        variant="outline"
        size="sm"
        aria-pressed={shown}
        startIcon={shown ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        onClick={() => setShown((current) => !current)}
      >
        {shown ? 'Hide key' : 'Reveal key'}
      </Button>
      {shown && (
        <Button
          size="sm"
          startIcon={
            copy === 'copied' ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />
          }
          onClick={() => void copyKey()}
        >
          {copy === 'copied' ? 'Copied' : 'Copy'}
        </Button>
      )}
      <span
        role="status"
        aria-live="polite"
        className={classNames(styles.status, copy === 'failed' && styles.failed)}
      >
        {copy === 'copied' && 'Key copied to the clipboard'}
        {copy === 'failed' && 'Could not copy automatically. Select the key and copy it.'}
      </span>
    </div>
  );
}
