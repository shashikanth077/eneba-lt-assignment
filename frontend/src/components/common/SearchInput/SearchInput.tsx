import { Search } from 'lucide-react';
import { useState } from 'react';
import { useDebounce } from '../../../hooks/useDebounce';
import { SEARCH_DEBOUNCE_MS } from '../../../utils/constants';
import styles from './SearchInput.module.scss';

interface SearchInputProps {
  /** The committed value (from the address): when it changes from outside, the text follows. */
  value: string;
  onSearch: (text: string) => void;
  label: string;
  placeholder?: string;
  debounceMs?: number;
  maxLength?: number;
}

/**
 * A search field that reports its text only after a pause in typing, and follows `value` when that changes by other means
 * (Back, a chip's remove button). The commit effect lives in useDebounce's callback form so it runs once per settled text.
 */
export function SearchInput({
  value,
  onSearch,
  label,
  placeholder,
  debounceMs = SEARCH_DEBOUNCE_MS,
  maxLength = 100,
}: SearchInputProps) {
  const [text, setText] = useState(value);
  // Follow the committed value when it changes under us. Adjusting state during render is React's way to derive state from props.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== text.trim()) setText(value); // do not eat a trailing space the person is still typing
  }

  useDebounce(text, debounceMs, (settled) => {
    const trimmed = settled.trim();
    if (trimmed !== value) onSearch(trimmed);
  });

  return (
    <div className={styles.wrap}>
      <Search className={styles.icon} aria-hidden />
      <input
        type="search"
        className={styles.input}
        value={text}
        placeholder={placeholder}
        aria-label={label}
        maxLength={maxLength}
        onChange={(event) => setText(event.target.value)}
      />
    </div>
  );
}
