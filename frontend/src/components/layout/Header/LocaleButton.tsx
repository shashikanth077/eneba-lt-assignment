import { Globe } from 'lucide-react';
import { useState } from 'react';
import { useAppSelector } from '../../../app/hooks';
import { LocaleModal } from '../../../features/settings/LocaleModal';
import { selectDisplayCurrency } from '../../../features/settings/settingsSlice';
import styles from './Header.module.scss';

/** "English EU | EUR": opens the language and currency settings. */
export function LocaleButton() {
  const currency = useAppSelector(selectDisplayCurrency);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.locale}
        aria-haspopup="dialog"
        aria-label={`Language and currency: English, ${currency}`}
        onClick={() => setOpen(true)}
      >
        <Globe size={18} aria-hidden /> English EU <span aria-hidden="true">|</span> {currency}
      </button>
      {/* mounted only while open, so it starts from the current choice every time */}
      {open && <LocaleModal open onClose={() => setOpen(false)} />}
    </>
  );
}
