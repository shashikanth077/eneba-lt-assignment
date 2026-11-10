import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'text';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows "busy" and ignores clicks, while keeping the button in place. */
  loading?: boolean;
  fullWidth?: boolean;
  startIcon?: ReactNode;
  /** When set the button is rendered as a router link (same look, real <a>). */
  to?: string;
  /** Link buttons have no `disabled`; this keeps them out of the tab order and tells screen readers. */
  linkDisabled?: boolean;
}
