import { Link } from 'react-router-dom';
import { classNames } from '../../../utils/classNames';
import type { ButtonProps } from './Button.types';
import styles from './Button.module.scss';

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  startIcon,
  to,
  linkDisabled = false,
  className,
  children,
  disabled,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  const classes = classNames(
    styles.button,
    styles[variant],
    styles[size],
    fullWidth && styles.fullWidth,
    className,
  );

  if (to !== undefined) {
    return (
      <Link
        to={to}
        className={classes}
        aria-disabled={linkDisabled || undefined}
        tabIndex={linkDisabled ? -1 : undefined}
        onClick={(event) => {
          if (linkDisabled) event.preventDefault();
          else onClick?.(event as never); // e.g. a drawer closes itself when one of its links is followed
        }}
        aria-label={rest['aria-label']}
      >
        {startIcon}
        {children}
      </Link>
    );
  }
  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={onClick}
    >
      {startIcon}
      {children}
    </button>
  );
}
