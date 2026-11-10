import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { Button, Modal, Select } from '../../components/common';
import { DISPLAY_CURRENCIES, LANGUAGES } from './currencies';
import { currencyChosen, selectDisplayCurrency } from './settingsSlice';
import styles from './LocaleModal.module.scss';

/** "Update your settings": language and currency. The choice is applied on Save and remembered in this browser. */
export function LocaleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const current = useAppSelector(selectDisplayCurrency);
  const [currency, setCurrency] = useState(current);
  const [language, setLanguage] = useState(LANGUAGES[0].code);

  return (
    <Modal open={open} onClose={onClose} title="Update your settings">
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          dispatch(currencyChosen(currency));
          onClose();
        }}
      >
        <p>Set your preferred language and the currency prices are shown in.</p>
        <Select
          label="Language"
          value={language}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
          onChange={setLanguage}
        />
        <p className={styles.note}>The interface is available in English only for now.</p>
        <Select
          label="Currency"
          value={currency}
          options={DISPLAY_CURRENCIES.map((c) => ({ value: c.code, label: c.label }))}
          onChange={setCurrency}
        />
        <p className={styles.note}>
          Your card is always charged in euros (EUR). Other currencies show approximate prices for
          reference, using fixed demo rates.
        </p>
        <div className={styles.actions}>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
