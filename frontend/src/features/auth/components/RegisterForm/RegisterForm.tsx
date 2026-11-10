import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Alert, Button, Input } from '../../../../components/common';
import { useAppDispatch, useAppSelector } from '../../../../app/hooks';
import { describeApiError, getFieldErrors } from '../../../../services/api/apiErrorHandler';
import { DEFAULT_AFTER_LOGIN, loginUrl } from '../../../../utils/redirect';
import { clearAuthErrors, registerRequest, selectAuth } from '../../authSlice';
import { registerSchema, type RegisterValues } from '../../authSchemas';
import styles from '../authForm.module.scss';

export function RegisterForm({ next }: { next: string }) {
  const dispatch = useAppDispatch();
  const { register: registration } = useAppSelector(selectAuth);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    mode: 'onTouched',
    defaultValues: { displayName: '', email: '', password: '' },
  });

  const fields = getFieldErrors(registration.error);
  useEffect(() => {
    for (const name of ['displayName', 'email', 'password'] as const) {
      const message = fields[name]?.[0];
      if (message) setError(name, { type: 'server', message });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fields` is derived from registration.error, which is what changes
  }, [registration.error, setError]);

  useEffect(() => () => void dispatch(clearAuthErrors()), [dispatch]);

  const submit = handleSubmit((values) => {
    dispatch(
      registerRequest({
        displayName: values.displayName.trim(),
        email: values.email.trim(),
        password: values.password,
      }),
    );
  });

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {registration.error && Object.keys(fields).length === 0 && (
        <Alert severity="error">{describeApiError(registration.error)}</Alert>
      )}
      <Input
        label="Display name"
        autoComplete="nickname"
        autoFocus
        helperText="2-50 characters"
        error={errors.displayName?.message}
        {...register('displayName')}
      />
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        helperText="At least 8 characters"
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" size="lg" loading={registration.loading}>
        {registration.loading ? 'Creating account…' : 'Create account'}
      </Button>
      <p className={styles.switch}>
        Already have an account?{' '}
        <Link to={next === DEFAULT_AFTER_LOGIN ? '/login' : loginUrl(next)}>Sign in</Link>
      </p>
    </form>
  );
}
