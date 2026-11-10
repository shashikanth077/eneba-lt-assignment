import type { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Error message: shown in the helper line, linked to the field with aria-describedby, marks it invalid. */
  error?: string;
  helperText?: string;
}
