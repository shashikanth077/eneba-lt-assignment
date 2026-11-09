import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import Badge from '@mui/material/Badge';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useEffect, useState } from 'react';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { MAX_QUERY_LENGTH, sortsFor, type SortKey } from './storeQuery';

export const SEARCH_DEBOUNCE_MS = 400;

const SORT_LABELS: Record<SortKey, string> = {
  popular: 'Popularity',
  relevance: 'Best match',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  newest: 'Newest',
  discount: 'Biggest discount',
};

/** Text search inside the store. Typing updates the address after a short pause; the address changing (Back, chip) updates the text. */
export function StoreSearch({ value, onCommit }: { value: string; onCommit: (q: string) => void }) {
  const [text, setText] = useState(value);
  // Follow the address when it changes under us (Back, a chip's x). Adjusting state during render is React's way to derive state from props.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== text.trim()) setText(value); // do not eat a trailing space the person is still typing
  }

  const settled = useDebouncedValue(text, SEARCH_DEBOUNCE_MS);
  useEffect(() => {
    const trimmed = settled.trim();
    if (trimmed !== value) onCommit(trimmed);
    // Only a settled text may commit; `value` is read fresh at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  return (
    <TextField
      value={text}
      onChange={(event) => setText(event.target.value)}
      placeholder="Search games in the store"
      fullWidth
      type="search"
      slotProps={{
        htmlInput: { 'aria-label': 'Search games in the store', maxLength: MAX_QUERY_LENGTH },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

export function SortSelect({
  value,
  q,
  onChange,
}: {
  value: SortKey;
  q: string;
  onChange: (sort: SortKey) => void;
}) {
  return (
    <TextField
      select
      label="Sort by"
      value={value}
      onChange={(event) => onChange(event.target.value as SortKey)}
      sx={{ minWidth: 200 }}
    >
      {sortsFor(q).map((sort) => (
        <MenuItem key={sort} value={sort}>
          {SORT_LABELS[sort]}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** Opens the filter drawer on small screens; the badge counts the active filters. */
export function FiltersButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <Button
      variant="outlined"
      onClick={onClick}
      startIcon={
        <Badge badgeContent={count} color="error">
          <FilterListIcon />
        </Badge>
      }
      sx={{ whiteSpace: 'nowrap' }}
    >
      Filters
    </Button>
  );
}
