import { useEffect, useState } from 'react';

/** Whether a CSS media query currently matches. Without matchMedia (old browsers, tests) it is false: the small-screen layout. */
export function useMediaQuery(query: string): boolean {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [matches, setMatches] = useState(() => supported && window.matchMedia(query).matches);

  useEffect(() => {
    if (!supported) return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query, supported]);

  return matches;
}
