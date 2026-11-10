import { Checkbox, Skeleton } from '../../../../components/common';
import type { FacetOption, Filters } from '../../../../types/api.types';
import type { StoreQuery } from '../../productsQuery';
import { PriceRangeSlider } from '../PriceRangeSlider';
import styles from './ProductFilters.module.scss';

interface ProductFiltersProps {
  query: StoreQuery;
  /** Option counts under the current filters; undefined while loading. */
  facets: Filters | undefined;
  /** Whole-catalogue price range, which stays put while filters change; undefined while loading. */
  priceBoundsCents: { min: number; max: number } | undefined;
  onChange: (patch: Partial<StoreQuery>) => void;
}

/** Options from the API plus any selected value the API no longer lists (e.g. 0 matches now), so a selection can always be undone. */
function withSelected(options: FacetOption[], selected: string[]): FacetOption[] {
  const known = new Set(options.map((option) => option.value));
  const missing = selected.filter((value) => !known.has(value));
  return [...options, ...missing.map((value) => ({ value, label: value, count: 0 }))];
}

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

function CheckGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: FacetOption[] | undefined;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{title}</legend>
      {options === undefined ? (
        <div role="status" aria-label={`Loading ${title}`}>
          <Skeleton className={styles.skeleton} />
        </div>
      ) : (
        <div className={styles.options}>
          {withSelected(options, selected).map((option) => (
            <Checkbox
              key={option.value}
              label={option.label}
              count={option.count}
              checked={selected.includes(option.value)}
              onChange={() => onToggle(option.value)}
            />
          ))}
        </div>
      )}
    </fieldset>
  );
}

/** The four filter groups. Pure view: it shows `query` and reports changes; the page owns the address. */
export function ProductFilters({ query, facets, priceBoundsCents, onChange }: ProductFiltersProps) {
  return (
    <div className={styles.filters}>
      <CheckGroup
        title="Platform"
        options={facets?.platforms}
        selected={query.platforms}
        onToggle={(value) => onChange({ platforms: toggle(query.platforms, value) })}
      />
      <CheckGroup
        title="Region"
        options={facets?.regions}
        selected={query.regions}
        onToggle={(value) => onChange({ regions: toggle(query.regions, value) })}
      />
      <CheckGroup
        title="Genre"
        options={facets?.genres}
        selected={query.genres}
        onToggle={(value) => onChange({ genres: toggle(query.genres, value) })}
      />
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Price</legend>
        {priceBoundsCents === undefined ? (
          <div role="status" aria-label="Loading price range">
            <Skeleton className={styles.skeleton} />
          </div>
        ) : (
          <PriceRangeSlider
            boundsCents={priceBoundsCents}
            valueCents={{ min: query.priceMin, max: query.priceMax }}
            onCommit={({ min, max }) => onChange({ priceMin: min, priceMax: max })}
          />
        )}
      </fieldset>
    </div>
  );
}
