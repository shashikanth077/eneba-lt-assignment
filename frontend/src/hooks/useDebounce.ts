import { useEffect, useRef, useState } from 'react';

/** Follows `value`, but only after it has stopped changing for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Calls `onSettled` once the value has rested for `delayMs`. The callback is read fresh at that moment (it may close over props that
 * changed while waiting), and a value that never changes never fires it.
 */
export function useDebounce<T>(value: T, delayMs: number, onSettled: (settled: T) => void): void {
  const settled = useDebouncedValue(value, delayMs);
  const callback = useRef(onSettled);
  useEffect(() => {
    callback.current = onSettled;
  });
  const first = useRef(true);
  useEffect(() => {
    // The first value is the initial one, not something the person settled on.
    if (first.current) {
      first.current = false;
      return;
    }
    callback.current(settled);
  }, [settled]);
}
