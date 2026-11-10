import { SearchInput } from '../../../../components/common';

/** The text search inside the store: reports after a pause in typing, and follows the address when it changes. */
export function ProductSearch({
  value,
  onSearch,
}: {
  value: string;
  onSearch: (q: string) => void;
}) {
  return (
    <SearchInput
      value={value}
      onSearch={onSearch}
      label="Search games in the store"
      placeholder="Search games in the store"
    />
  );
}
