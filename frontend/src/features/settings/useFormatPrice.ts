import { useAppSelector } from '../../app/hooks';
import { formatCurrency } from '../../utils/formatCurrency';
import { convertCents } from './currencies';
import { selectDisplayCurrency } from './settingsSlice';

/** Formats a catalogue price (euro cents) in the visitor's chosen display currency. */
export function useFormatPrice(): (euroCents: number) => string {
  const currency = useAppSelector(selectDisplayCurrency);
  return (euroCents) => formatCurrency(convertCents(euroCents, currency), currency);
}
