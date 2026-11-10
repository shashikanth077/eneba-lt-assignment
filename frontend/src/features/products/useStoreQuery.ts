import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { defaultSort, parseStoreQuery, toSearchParams, type StoreQuery } from './productsQuery';

interface UpdateOptions {
  /** Typing makes many small changes: those replace the history entry instead of filling the Back button. */
  replace?: boolean;
}

/**
 * The store's state lives in the address bar. Reading parses it; changing it navigates. A change to anything but the page
 * goes back to page 1 (the old page number may not exist any more under the new filters).
 */
export function useStoreQuery() {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => parseStoreQuery(params), [params]);

  const update = useCallback(
    (patch: Partial<StoreQuery>, { replace = false }: UpdateOptions = {}) => {
      // The functional form reads the address at the moment of the change, so two quick updates cannot overwrite each other.
      setParams(
        (current) => {
          const before = parseStoreQuery(current);
          const next = { ...before, ...patch };
          // Someone on the default sort never chose one: when a search text appears or goes away, the default moves with it.
          if (patch.sort === undefined && before.sort === defaultSort(before.q))
            next.sort = defaultSort(next.q);
          if (patch.page === undefined) next.page = 1;
          // Parsing the result once more repairs combinations that make no sense (e.g. sort=relevance after the search text was cleared).
          return toSearchParams(parseStoreQuery(toSearchParams(next)));
        },
        { replace },
      );
    },
    [setParams],
  );

  return { query, update };
}
