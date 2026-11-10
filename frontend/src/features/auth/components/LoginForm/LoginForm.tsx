import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Alert, Button, Input } from '../../../../components/common';
import { useAppDispatch, useAppSelector } from '../../../../app/hooks';
import { describeApiError, getFieldErrors } from '../../../../services/api/apiErrorHandler';
import { DEFAULT_AFTER_LOGIN } from '../../../../utils/redirect';
import { clearAuthErrors, loginRequest, selectAuth } from '../../authSlice';
import { loginSchema, type LoginValues } from '../../authSchemas';
import styles from '../authForm.module.scss';

/** Validated sign-in form: React Hook Form + zod for the rules, the store for the request, the server's answer shown under the fields. */
export function LoginForm({ next }: { next: string }) {
  const dispatch = useAppDispatch();
  const { login } = useAppSelector(selectAuth);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });

  // Show the server's field messages (422) under the matching field.
  const fields = getFieldErrors(login.error);
  useEffect(() => {
    for (const name of ['email', 'password'] as const) {
      const message = fields[name]?.[0];
      if (message) setError(name, { type: 'server', message });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fields` is derived from login.error, which is what changes
  }, [login.error, setError]);

  // A new visit to the form starts without the previous attempt's error.
  useEffect(() => () => void dispatch(clearAuthErrors()), [dispatch]);

  const submit = handleSubmit((values) => {
    dispatch(loginRequest({ email: values.email.trim(), password: values.password }));
  });

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {login.error && Object.keys(fields).length === 0 && (
        <Alert severity="error">{describeApiError(login.error)}</Alert>
      )}
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        autoFocus
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" size="lg" loading={login.loading}>
        {login.loading ? 'Signing in…' : 'Sign in'}
      </Button>
      <p className={styles.switch}>
        New here?{' '}
        <Link
          to={
            next === DEFAULT_AFTER_LOGIN
              ? '/register'
              : `/register?next=${encodeURIComponent(next)}`
          }
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
