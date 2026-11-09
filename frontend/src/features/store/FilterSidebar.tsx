import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import type { FacetOption, Filters } from '../../api/types';
import { PriceFilter } from './PriceFilter';
import type { StoreQuery } from './storeQuery';

interface FilterSidebarProps {
  query: StoreQuery;
  /** Option counts under the current filters; undefined while loading. */
  facets: Filters | undefined;
  /** Whole-catalog price range, which stays put while filters change; undefined while loading. */
  priceBoundsCents: { min: number; max: number } | undefined;
  onChange: (patch: Partial<StoreQuery>, options?: { replace?: boolean }) => void;
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
    <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
      <Typography component="legend" variant="subtitle1" sx={{ mb: 1 }}>
        {title}
      </Typography>
      {options === undefined ? (
        <Skeleton variant="rectangular" height={96} aria-label={`Loading ${title}`} />
      ) : (
        <FormGroup sx={{ flexWrap: 'nowrap', maxHeight: 260, overflowY: 'auto' }}>
          {withSelected(options, selected).map((option) => (
            <FormControlLabel
              key={option.value}
              control={
                <Checkbox
                  size="small"
                  checked={selected.includes(option.value)}
                  onChange={() => onToggle(option.value)}
                />
              }
              label={
                <Box
                  component="span"
                  sx={{ display: 'flex', gap: 1, justifyContent: 'space-between', width: '100%' }}
                >
                  <span>{option.label}</span>
                  <Typography component="span" variant="body2" color="text.secondary">
                    {option.count}
                  </Typography>
                </Box>
              }
              sx={{ mr: 0, '& .MuiFormControlLabel-label': { flex: 1 } }}
            />
          ))}
        </FormGroup>
      )}
    </Box>
  );
}

/** The four filter groups. Pure view: it shows `query` and reports changes; the page owns the address. */
export function FilterSidebar({ query, facets, priceBoundsCents, onChange }: FilterSidebarProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
      <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
        <Typography component="legend" variant="subtitle1" sx={{ mb: 1.5 }}>
          Price
        </Typography>
        {priceBoundsCents === undefined ? (
          <Skeleton variant="rectangular" height={48} aria-label="Loading price range" />
        ) : (
          <PriceFilter
            boundsCents={priceBoundsCents}
            valueCents={{ min: query.priceMin, max: query.priceMax }}
            onCommit={({ min, max }) => onChange({ priceMin: min, priceMax: max })}
          />
        )}
      </Box>
    </Box>
  );
}
