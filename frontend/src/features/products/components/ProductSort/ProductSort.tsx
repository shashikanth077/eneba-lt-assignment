import { Select, type SelectOption } from '../../../../components/common';
import { sortsFor, type SortKey } from '../../productsQuery';

const SORT_LABELS: Record<SortKey, string> = {
  popular: 'Popularity',
  relevance: 'Best match',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  newest: 'Newest',
  discount: 'Biggest discount',
};

/** "Best match" is offered only while there is a search text (the API refuses it otherwise). */
export function ProductSort({
  value,
  q,
  onChange,
}: {
  value: SortKey;
  q: string;
  onChange: (sort: SortKey) => void;
}) {
  const options: SelectOption<SortKey>[] = sortsFor(q).map((sort) => ({
    value: sort,
    label: SORT_LABELS[sort],
  }));
  return <Select label="Sort by" value={value} options={options} onChange={onChange} />;
}
