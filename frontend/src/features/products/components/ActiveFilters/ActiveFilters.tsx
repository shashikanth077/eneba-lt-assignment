import { Button, Chip } from '../../../../components/common';
import type { Filters } from '../../../../types/api.types';
import { formatCurrency } from '../../../../utils/formatCurrency';
import { cleared, hasActiveFilters, type StoreQuery } from '../../productsQuery';
import styles from './ActiveFilters.module.scss';

interface ActiveFiltersProps {
  query: StoreQuery;
  /** Used to show "Steam" instead of the slug "steam"; unknown values fall back to the raw value. */
  labels: Filters | undefined;
  onChange: (patch: Partial<StoreQuery>) => void;
}

const labelOf = (options: Filters['platforms'] | undefined, value: string) =>
  options?.find((option) => option.value === value)?.label ?? value;

function priceLabel(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${formatCurrency(min)} – ${formatCurrency(max)}`;
  return min !== null ? `From ${formatCurrency(min)}` : `Up to ${formatCurrency(max ?? 0)}`;
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
    <section className={styles.row} aria-label="Active filters">
      {chips.map((chip) => (
        <Chip key={chip.key} label={chip.label} onRemove={chip.remove} />
      ))}
      <Button variant="text" size="sm" onClick={() => onChange(cleared(query))}>
        Clear all
      </Button>
    </section>
  );
}
