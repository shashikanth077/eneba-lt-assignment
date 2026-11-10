import { Search } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { fetchSuggestionsRequest } from '../../../features/products/productsSlice';
import { selectSuggestionsEntry } from '../../../features/products/productsSelectors';
import { useDebouncedValue } from '../../../hooks/useDebounce';
import type { Suggestion } from '../../../types/api.types';
import styles from './SearchBox.module.scss';

const MIN_CHARS = 2;

/**
 * The global search, in the header of every page. Typing shows live suggestions (debounced, ranked by the server, typo tolerant);
 * choosing one opens the product, Enter or the search icon opens /search?q=... with everything that matches.
 * An ARIA 1.2 combobox: the input owns focus, the list is a listbox, the highlighted option is announced through aria-activedescendant.
 */
export function SearchBox({ debounceMs = 250 }: { debounceMs?: number }) {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const [params] = useSearchParams();
  const listId = useId();

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
  const [active, setActive] = useState(-1);

  const term = useDebouncedValue(input.trim(), debounceMs);
  const enabled = term.length >= MIN_CHARS;
  useEffect(() => {
    if (enabled) dispatch(fetchSuggestionsRequest(term));
  }, [dispatch, enabled, term]);
  const entry = useAppSelector(selectSuggestionsEntry(term));

  const suggestions: Suggestion[] = enabled ? (entry?.data?.suggestions ?? []) : [];
  const failed = enabled && entry?.status === 'failed';
  const waiting = input.trim() !== term || (enabled && entry?.data === undefined && !failed);
  const showList = open && input.trim().length >= MIN_CHARS;

  const search = (query: string) => {
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    void navigate(`/search?q=${encodeURIComponent(q)}`);
  };
  const choose = (option: Suggestion) => {
    setInput('');
    setOpen(false);
    setActive(-1);
    void navigate(`/product/${option.slug}`);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (active >= 0 && suggestions[active]) choose(suggestions[active]);
    else search(input);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (suggestions.length === 0 ? -1 : (i + 1) % suggestions.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) =>
        suggestions.length === 0 ? -1 : (i - 1 + suggestions.length) % suggestions.length,
      );
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <form role="search" className={styles.form} onSubmit={submit}>
      <div className={styles.field}>
        <Search className={styles.icon} aria-hidden />
        <input
          type="text"
          role="combobox"
          className={styles.input}
          placeholder="Search for games, gift cards and more"
          aria-label="Search games"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className={styles.listbox}
          onMouseDown={(event) => event.preventDefault()}
        >
          {suggestions.map((option, index) => (
            <li
              key={option.slug}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={styles.option}
              onClick={() => choose(option)}
            >
              <img src={option.coverUrl} alt="" loading="lazy" className={styles.cover} />
              <span className={styles.text}>
                <span className={styles.name} style={{ display: 'block' }}>
                  {option.name}
                </span>
                <span className={styles.platform}>{option.platform.name}</span>
              </span>
              {!option.inStock && <span className={styles.sold}>Out of stock</span>}
            </li>
          ))}
          {suggestions.length === 0 && (
            <li role="presentation" className={styles.message}>
              {waiting
                ? 'Searching…'
                : failed
                  ? 'Suggestions are unavailable. Press Enter to search.'
                  : `No games match "${term}"`}
            </li>
          )}
        </ul>
      )}
    </form>
  );
}
