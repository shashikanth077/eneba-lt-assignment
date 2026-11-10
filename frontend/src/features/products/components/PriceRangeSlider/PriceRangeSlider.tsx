import { useState } from 'react';
import { useDebounce } from '../../../../hooks/useDebounce';
import { useFormatPrice } from '../../../settings/useFormatPrice';
import styles from './PriceRangeSlider.module.scss';

/** How long the slider must rest before the address (and so the request) changes. */
export const PRICE_DEBOUNCE_MS = 400;

interface PriceRangeSliderProps {
  /** Cheapest and dearest price in the whole catalogue, in cents. */
  boundsCents: { min: number; max: number };
  /** The chosen range from the address (null = not limited on that side). */
  valueCents: { min: number | null; max: number | null };
  onCommit: (range: { min: number | null; max: number | null }) => void;
}

const toEuros = (cents: number) => Math.round(cents / 100);

/**
 * Two-thumb slider in whole euros. Dragging only moves local state; after PRICE_DEBOUNCE_MS without a change the range is written to
 * the address once. When the address changes by other means (Back, a chip's x, "Clear all") the slider follows it.
 */
export function PriceRangeSlider({ boundsCents, valueCents, onCommit }: PriceRangeSliderProps) {
  const formatPrice = useFormatPrice();
  const floor = Math.floor(boundsCents.min / 100);
  const ceil = Math.max(floor + 1, Math.ceil(boundsCents.max / 100));
  const fromAddress: [number, number] = [
    valueCents.min === null ? floor : Math.max(floor, toEuros(valueCents.min)),
    valueCents.max === null ? ceil : Math.min(ceil, toEuros(valueCents.max)),
  ];

  const [draft, setDraft] = useState<[number, number]>(fromAddress);
  // Follow the address when it changes under us (Back, a chip's x, "Clear all"): adjusting state during render derives it from props.
  const [seen, setSeen] = useState(fromAddress);
  if (seen[0] !== fromAddress[0] || seen[1] !== fromAddress[1]) {
    setSeen(fromAddress);
    setDraft(fromAddress);
  }

  useDebounce(draft, PRICE_DEBOUNCE_MS, (settled) => {
    if (settled[0] === fromAddress[0] && settled[1] === fromAddress[1]) return;
    // The full range means "no price filter", so it is not written to the address.
    onCommit({
      min: settled[0] === floor ? null : settled[0] * 100,
      max: settled[1] === ceil ? null : settled[1] * 100,
    });
  });

  const percent = (value: number) => ((value - floor) / (ceil - floor)) * 100;

  return (
    <div className={styles.wrap}>
      <div className={styles.track}>
        <div className={styles.rail} />
        <div
          className={styles.selected}
          style={{ left: `${percent(draft[0])}%`, right: `${100 - percent(draft[1])}%` }}
        />
        <input
          type="range"
          className={styles.thumb}
          min={floor}
          max={ceil}
          step={1}
          value={draft[0]}
          aria-label="Minimum price"
          aria-valuetext={formatPrice(draft[0] * 100)}
          onChange={(event) => setDraft([Math.min(Number(event.target.value), draft[1]), draft[1]])}
        />
        <input
          type="range"
          className={styles.thumb}
          min={floor}
          max={ceil}
          step={1}
          value={draft[1]}
          aria-label="Maximum price"
          aria-valuetext={formatPrice(draft[1] * 100)}
          onChange={(event) => setDraft([draft[0], Math.max(Number(event.target.value), draft[0])])}
        />
      </div>
      <div className={styles.values}>
        <span data-testid="price-low">{formatPrice(draft[0] * 100)}</span>
        <span data-testid="price-high">{formatPrice(draft[1] * 100)}</span>
      </div>
    </div>
  );
}
