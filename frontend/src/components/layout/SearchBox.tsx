import SearchIcon from '@mui/icons-material/Search';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { Suggestion } from '../../api/types';
import { useSuggestQuery } from '../../features/search/searchApi';
import { useDebouncedValue } from '../../lib/useDebouncedValue';

const MIN_CHARS = 2;

/**
 * The global search, in the header of every page. Typing shows live suggestions (debounced, ranked by the server, typo tolerant);
 * choosing one opens the product, Enter or the search icon opens /search?q=... with everything that matches.
 */
export function SearchBox({ debounceMs = 250 }: { debounceMs?: number }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  // On /search?q=... the box shows the query; everywhere else it starts empty. Adjusting state while rendering (not in an effect)
  // is the pattern React recommends for "reset this state when that value changes".
  const urlQuery = location.pathname === '/search' ? (params.get('q') ?? '') : '';
  const [input, setInput] = useState(urlQuery);
  const [syncedWith, setSyncedWith] = useState(urlQuery);
  if (syncedWith !== urlQuery) {
    setSyncedWith(urlQuery);
    setInput(urlQuery);
  }
  const [open, setOpen] = useState(false);

  const term = useDebouncedValue(input.trim(), debounceMs);
  const enabled = term.length >= MIN_CHARS;
  const { data, isFetching, isError } = useSuggestQuery(term, { skip: !enabled });
  const suggestions: Suggestion[] = enabled ? (data?.suggestions ?? []) : [];
  const waiting = input.trim() !== term || (enabled && isFetching && data === undefined);

  const search = (query: string) => {
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    void navigate(`/search?q=${encodeURIComponent(q)}`);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault(); // reached only when no suggestion was highlighted: MUI handles Enter on a highlighted one itself
    search(input);
  };

  return (
    <Box component="form" role="search" onSubmit={submit} sx={{ width: '100%' }}>
      <Autocomplete<Suggestion>
        options={suggestions}
        value={null}
        inputValue={input}
        open={open && input.trim().length >= MIN_CHARS}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        onInputChange={(_, value, reason) => {
          if (reason !== 'reset') setInput(value); // 'reset' = MUI echoing the chosen option's label back; we clear instead
        }}
        onChange={(_, option) => {
          if (!option) return;
          setInput('');
          setOpen(false);
          void navigate(`/product/${option.slug}`);
        }}
        filterOptions={(options) => options} // the server already ranked and filtered them
        getOptionLabel={(option) => option.name}
        getOptionKey={(option) => option.slug} // names repeat across platforms/regions, slugs do not
        isOptionEqualToValue={(a, b) => a.slug === b.slug}
        loading={waiting}
        loadingText="Searching…"
        noOptionsText={
          isError
            ? 'Suggestions are unavailable. Press Enter to search.'
            : `No games match "${term}"`
        }
        forcePopupIcon={false}
        slotProps={{ listbox: { sx: { maxHeight: 'min(440px, 60vh)' } } }} // room for all six suggestions on a desktop screen
        renderInput={({ slotProps, ...inputParams }) => (
          <TextField
            {...inputParams}
            placeholder="Search for games, gift cards and more"
            slotProps={{
              inputLabel: slotProps.inputLabel,
              htmlInput: { ...slotProps.htmlInput, 'aria-label': 'Search games' },
              input: {
                ...slotProps.input,
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: 'transparent',
                height: { xs: 48, md: 56 },
                pl: 1.5,
                '& fieldset': { borderColor: 'rgba(255,255,255,0.85)' },
                '&:hover fieldset': { borderColor: '#fff' },
                '&.Mui-focused fieldset': { borderColor: '#fff', borderWidth: 2 },
              },
              '& .MuiOutlinedInput-input': { fontWeight: 600 },
            }}
          />
        )}
        renderOption={(optionProps, option) => {
          const { key, ...rest } = optionProps;
          return (
            <Box
              component="li"
              key={key}
              {...rest}
              sx={{ display: 'flex', gap: 1.5, alignItems: 'center', py: 1 }}
            >
              <Box
                component="img"
                src={option.coverUrl}
                alt=""
                loading="lazy"
                sx={{ width: 36, height: 48, objectFit: 'cover', flexShrink: 0 }}
              />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography noWrap sx={{ fontWeight: 700 }}>
                  {option.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                  {option.platform.name}
                </Typography>
              </Box>
              {!option.inStock && <Chip size="small" label="Out of stock" sx={{ height: 24 }} />}
            </Box>
          );
        }}
      />
    </Box>
  );
}
