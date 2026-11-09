import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { formatMoney } from '../../lib/money';

/** How long the slider must rest before the address (and so the request) changes. */
export const PRICE_DEBOUNCE_MS = 400;

interface PriceFilterProps {
  /** Cheapest and dearest price in the whole catalog, in cents. */
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
export function PriceFilter({ boundsCents, valueCents, onCommit }: PriceFilterProps) {
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

  const settled = useDebouncedValue(draft, PRICE_DEBOUNCE_MS);
  useEffect(() => {
    if (settled[0] === fromAddress[0] && settled[1] === fromAddress[1]) return;
    // The full range means "no price filter", so it is not written to the address.
    onCommit({
      min: settled[0] === floor ? null : settled[0] * 100,
      max: settled[1] === ceil ? null : settled[1] * 100,
    });
    // Only a settled slider position may trigger a commit; the other values are read fresh at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  return (
    <Box>
      <Slider
        value={draft}
        min={floor}
        max={ceil}
        step={1}
        disableSwap
        valueLabelDisplay="off"
        getAriaLabel={(index) => (index === 0 ? 'Minimum price' : 'Maximum price')}
        getAriaValueText={(value) => formatMoney(value * 100)}
        onChange={(_, value) => setDraft([value[0], value[1]])}
        sx={{ mx: 1, width: 'calc(100% - 16px)' }}
      />
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="body2" data-testid="price-low">
          {formatMoney(draft[0] * 100)}
        </Typography>
        <Typography variant="body2" data-testid="price-high">
          {formatMoney(draft[1] * 100)}
        </Typography>
      </Box>
    </Box>
  );
}
