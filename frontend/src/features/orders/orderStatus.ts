import type { OrderStatus } from '../../types/api.types';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Waiting for payment',
  paid: 'Paid',
  failed: 'Payment failed',
  expired: 'Expired',
  canceled: 'Canceled',
  refund_needed: 'Refund in progress',
  refunded: 'Refunded',
};

export type StatusTone = 'success' | 'warning' | 'error' | 'neutral';

export const STATUS_TONE: Record<OrderStatus, StatusTone> = {
  paid: 'success',
  pending: 'warning',
  failed: 'error',
  refund_needed: 'error',
  refunded: 'neutral',
  expired: 'neutral',
  canceled: 'neutral',
};
