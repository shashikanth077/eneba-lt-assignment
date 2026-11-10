import { Button } from '../../../../components/common';
import { EmptyState } from '../../../../components/feedback/EmptyState';

export function CartEmptyState({
  description = 'Find something you like and add it to your cart.',
}: {
  description?: string;
}) {
  return (
    <EmptyState
      title="Your cart is empty"
      description={description}
      action={<Button to="/store">Browse the store</Button>}
    />
  );
}
