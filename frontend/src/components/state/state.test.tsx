import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';
import { QueryBoundary } from './QueryBoundary';

describe('shared state components', () => {
  it('LoadingState announces itself politely', () => {
    render(<LoadingState label="Loading your cart…" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading your cart…');
  });

  it('ErrorState explains the problem in words and offers a retry only when it can', async () => {
    const retry = vi.fn();
    const { rerender } = render(<ErrorState error={{ status: 'FETCH_ERROR' }} onRetry={retry} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/Cannot reach the server/);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(
      <ErrorState
        error={{
          status: 404,
          data: { error: { code: 'not_found', message: 'Order not found', details: null } },
        }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Order not found');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('EmptyState shows its action', () => {
    render(
      <EmptyState
        title="No orders yet"
        description="Buy something"
        action={<button>Browse</button>}
      />,
    );

    expect(screen.getByRole('heading', { name: 'No orders yet' })).toBeInTheDocument();
    expect(screen.getByText('Buy something')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse' })).toBeInTheDocument();
  });
});

describe('QueryBoundary', () => {
  const base = { isLoading: false, isError: false, refetch: vi.fn() };

  it('shows the loading state until the first data arrives', () => {
    render(<QueryBoundary query={{ ...base, isLoading: true }}>{() => <p>data</p>}</QueryBoundary>);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('data')).not.toBeInTheDocument();
  });

  it('shows the error state with a working retry when there is no data', async () => {
    const refetch = vi.fn();
    render(
      <QueryBoundary
        query={{ ...base, isError: true, error: { status: 'FETCH_ERROR' }, refetch }}
        errorTitle="We could not load your orders"
      >
        {() => <p>data</p>}
      </QueryBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('We could not load your orders');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('shows the empty state when the data is empty, and the content otherwise', () => {
    const { rerender } = render(
      <QueryBoundary
        query={{ ...base, data: [] as number[] }}
        isEmpty={(d) => d.length === 0}
        empty={<p>nothing</p>}
      >
        {(d) => <p>{d.length} rows</p>}
      </QueryBoundary>,
    );
    expect(screen.getByText('nothing')).toBeInTheDocument();

    rerender(
      <QueryBoundary
        query={{ ...base, data: [1, 2] }}
        isEmpty={(d) => d.length === 0}
        empty={<p>nothing</p>}
      >
        {(d) => <p>{d.length} rows</p>}
      </QueryBoundary>,
    );
    expect(screen.getByText('2 rows')).toBeInTheDocument();
  });

  it('keeps showing stale data when a refetch fails (no flash of an error screen over content)', () => {
    render(
      <QueryBoundary query={{ ...base, data: [1], isError: true, error: { status: 500 } }}>
        {(d) => <p>{d.length} rows</p>}
      </QueryBoundary>,
    );

    expect(screen.getByText('1 rows')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
