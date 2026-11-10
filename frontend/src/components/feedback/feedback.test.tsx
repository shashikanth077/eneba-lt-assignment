import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '../../app/store';
import { showToast } from '../../features/ui/uiSlice';
import { Loader } from '../common';
import { EmptyState } from './EmptyState';
import { ErrorMessage } from './ErrorMessage';
import { ToastRegion } from './Toast';

afterEach(() => vi.useRealTimers());

describe('shared feedback components', () => {
  it('Loader announces itself politely', () => {
    render(<Loader label="Loading your cart…" />);
    expect(screen.getByRole('status')).toHaveAccessibleName('Loading your cart…');
  });

  it('ErrorMessage explains the problem in words and offers a retry only when it can', async () => {
    const retry = vi.fn();
    const error = {
      status: 0,
      code: 'network_error',
      message: 'Cannot reach the server. Check your connection and try again.',
      details: null,
    };
    const { rerender } = render(<ErrorMessage error={error} onRetry={retry} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/Cannot reach the server/);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(
      <ErrorMessage
        error={{ status: 404, code: 'not_found', message: 'Order not found', details: null }}
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

describe('toasts', () => {
  it('appear in a polite region, can be dismissed, and dismiss themselves', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const store = makeStore();
    render(
      <Provider store={store}>
        <ToastRegion />
      </Provider>,
    );
    expect(screen.getByRole('region', { name: 'Notifications' })).toHaveAttribute(
      'aria-live',
      'polite',
    );

    act(() => void store.dispatch(showToast('success', 'Added to your cart')));
    expect(screen.getByText('Added to your cart')).toBeInTheDocument();
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Added to your cart')).not.toBeInTheDocument();

    act(() => void store.dispatch(showToast('info', 'Gone soon')));
    expect(screen.getByText('Gone soon')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.queryByText('Gone soon')).not.toBeInTheDocument();
  });
});
