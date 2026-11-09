import CancelIcon from '@mui/icons-material/Cancel';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import type { Filters } from '../../api/types';
import { formatMoney } from '../../lib/money';
import { cleared, hasActiveFilters, type StoreQuery } from './storeQuery';

interface ActiveFiltersProps {
  query: StoreQuery;
  /** Used to show "Steam" instead of the slug "steam"; unknown values fall back to the raw value. */
  labels: Filters | undefined;
  onChange: (patch: Partial<StoreQuery>) => void;
}

const labelOf = (options: Filters['platforms'] | undefined, value: string) =>
  options?.find((option) => option.value === value)?.label ?? value;

function priceLabel(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${formatMoney(min)} – ${formatMoney(max)}`;
  return min !== null ? `From ${formatMoney(min)}` : `Up to ${formatMoney(max ?? 0)}`;
}

/** One removable chip per active filter, plus "Clear all". Removing a chip changes the address like unticking the box would. */
export function ActiveFilters({ query, labels, onChange }: ActiveFiltersProps) {
  if (!hasActiveFilters(query)) return null;

  const chips: { key: string; label: string; remove: () => void }[] = [
    ...(query.q !== ''
      ? [{ key: 'q', label: `Search: ${query.q}`, remove: () => onChange({ q: '' }) }]
      : []),
    ...query.platforms.map((value) => ({
      key: `platform:${value}`,
      label: labelOf(labels?.platforms, value),
      remove: () => onChange({ platforms: query.platforms.filter((item) => item !== value) }),
    })),
    ...query.regions.map((value) => ({
      key: `region:${value}`,
      label: labelOf(labels?.regions, value),
      remove: () => onChange({ regions: query.regions.filter((item) => item !== value) }),
    })),
    ...query.genres.map((value) => ({
      key: `genre:${value}`,
      label: labelOf(labels?.genres, value),
      remove: () => onChange({ genres: query.genres.filter((item) => item !== value) }),
    })),
    ...(query.priceMin !== null || query.priceMax !== null
      ? [
          {
            key: 'price',
            label: priceLabel(query.priceMin, query.priceMax),
            remove: () => onChange({ priceMin: null, priceMax: null }),
          },
        ]
      : []),
  ];

  return (
    <Stack
      direction="row"
      component="section"
      aria-label="Active filters"
      sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'center' }}
    >
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          label={chip.label}
          onDelete={chip.remove}
          deleteIcon={<CancelIcon aria-label={`Remove ${chip.label}`} />}
        />
      ))}
      <Button color="primary" size="small" variant="text" onClick={() => onChange(cleared(query))}>
        Clear all
      </Button>
    </Stack>
  );
}
