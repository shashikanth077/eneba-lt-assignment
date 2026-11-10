import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { Alert, Button, Input } from '../../../components/common';
import { describeApiError, getFieldErrors } from '../../../services/api/apiErrorHandler';
import {
  changePasswordSchema,
  profileSchema,
  type ChangePasswordValues,
  type ProfileValues,
} from '../authSchemas';
import { changePasswordRequest, selectAuth, updateProfileRequest } from '../authSlice';
import styles from './AccountPage.module.scss';

function ProfileForm() {
  const dispatch = useAppDispatch();
  const { user, profile } = useAppSelector(selectAuth);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: user?.displayName ?? '' },
  });
  const fields = getFieldErrors(profile.error);
  useEffect(() => {
    const message = fields.displayName?.[0];
    if (message) setError('displayName', { type: 'server', message });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- derived from profile.error
  }, [profile.error, setError]);

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={handleSubmit((values) => dispatch(updateProfileRequest(values.displayName.trim())))}
    >
      <h2 className={styles.heading}>Edit profile</h2>
      {profile.saved && (
        <Alert severity="success" role="status">
          Your profile was saved.
        </Alert>
      )}
      {profile.error && Object.keys(fields).length === 0 && (
        <Alert severity="error">{describeApiError(profile.error)}</Alert>
      )}
      <Input
        label="Display name"
        autoComplete="name"
        error={errors.displayName?.message}
        {...register('displayName')}
      />
      <Input
        label="Email"
        type="email"
        value={user?.email ?? ''}
        readOnly
        helperText="Your email is your login and cannot be changed here."
      />
      <Button type="submit" loading={profile.loading}>
        Save profile
      </Button>
    </form>
  );
}

function PasswordForm() {
  const dispatch = useAppDispatch();
  const { password } = useAppSelector(selectAuth);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });
  const fields = getFieldErrors(password.error);
  useEffect(() => {
    for (const name of ['currentPassword', 'newPassword'] as const) {
      const message = fields[name]?.[0];
      if (message) setError(name, { type: 'server', message });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- derived from password.error
  }, [password.error, setError]);
  useEffect(() => {
    if (password.saved) reset();
  }, [password.saved, reset]);

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={handleSubmit((values) =>
        dispatch(
          changePasswordRequest({
            currentPassword: values.currentPassword,
            newPassword: values.newPassword,
          }),
        ),
      )}
    >
      <h2 className={styles.heading}>Change password</h2>
      {password.saved && (
        <Alert severity="success" role="status">
          Your password was changed. Other devices were signed out.
        </Alert>
      )}
      {password.error && Object.keys(fields).length === 0 && (
        <Alert severity="error">{describeApiError(password.error)}</Alert>
      )}
      <Input
        label="Current password"
        type="password"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      <Input
        label="New password"
        type="password"
        autoComplete="new-password"
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      <Input
        label="Repeat the new password"
        type="password"
        autoComplete="new-password"
        error={errors.confirm?.message}
        {...register('confirm')}
      />
      <Button type="submit" loading={password.loading}>
        Change password
      </Button>
    </form>
  );
}

/** /account: edit profile and change password (the order history is /orders). Signed-in only (ProtectedRoute). */
export function AccountPage() {
  return (
    <div className={styles.page}>
      <h1>My account</h1>
      <p>
        <Button to="/orders" variant="outline">
          My orders
        </Button>
      </p>
      <div className={styles.grid}>
        <ProfileForm />
        <PasswordForm />
      </div>
    </div>
  );
}
