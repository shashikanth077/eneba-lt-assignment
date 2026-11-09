import type { OrderStatus } from '../../api/types';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Waiting for payment',
  paid: 'Paid',
  failed: 'Payment failed',
  expired: 'Expired',
  canceled: 'Canceled',
  refund_needed: 'Refund in progress',
  refunded: 'Refunded',
};

export const STATUS_COLOR: Record<OrderStatus, 'success' | 'warning' | 'error' | 'default'> = {
  paid: 'success',
  pending: 'warning',
  failed: 'error',
  refund_needed: 'error',
  refunded: 'default',
  expired: 'default',
  canceled: 'default',
};
