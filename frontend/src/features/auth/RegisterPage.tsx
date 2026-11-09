import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink, Navigate, useSearchParams } from 'react-router-dom';
import { describeError, getFieldErrors } from '../../api/errors';
import { useAppSelector } from '../../app/hooks';
import { LoadingState } from '../../components/state/LoadingState';
import { DEFAULT_AFTER_LOGIN, loginUrl, safeNext } from '../../lib/redirect';
import { AuthCard } from './AuthCard';
import { validateRegister } from './validation';
import { useRegisterMutation } from './authApi';

export function RegisterPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const status = useAppSelector((state) => state.auth.status);
  const [register, { isLoading, error }] = useRegisterMutation();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ displayName: false, email: false, password: false });
  const [attempted, setAttempted] = useState(false);

  if (status === 'authenticated') return <Navigate to={next} replace />;
  if (status === 'unknown') return <LoadingState label="Checking your session…" />;

  const fields = getFieldErrors(error);
  const problems = validateRegister({ displayName, email, password });
  const shown = (name: 'displayName' | 'email' | 'password') =>
    attempted || touched[name] ? problems[name] : undefined;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(problems).length > 0) return;
    void register({ displayName: displayName.trim(), email: email.trim(), password });
  };

  return (
    <AuthCard title="Create your account">
      <Box component="form" onSubmit={submit} noValidate sx={{ display: 'grid', gap: 2 }}>
        {error && Object.keys(fields).length === 0 && (
          <Alert severity="error">{describeError(error)}</Alert>
        )}
        <TextField
          label="Display name"
          autoComplete="nickname"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, displayName: true }))}
          error={Boolean(shown('displayName') ?? fields.displayName)}
          helperText={shown('displayName') ?? fields.displayName?.[0] ?? '2-50 characters'}
          required
          autoFocus
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={Boolean(shown('email') ?? fields.email)}
          helperText={shown('email') ?? fields.email?.[0] ?? ' '} // a blank line is reserved so the message appearing does not move the page under the pointer (a click on a link below would be lost)
          required
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={Boolean(shown('password') ?? fields.password)}
          helperText={shown('password') ?? fields.password?.[0] ?? 'At least 8 characters'}
          required
        />
        <Button type="submit" variant="contained" size="large" disabled={isLoading}>
          {isLoading ? 'Creating account…' : 'Create account'}
        </Button>
        <Typography color="text.secondary">
          Already have an account?{' '}
          <Link
            component={RouterLink}
            to={next === DEFAULT_AFTER_LOGIN ? '/login' : loginUrl(next)}
          >
            Sign in
          </Link>
        </Typography>
      </Box>
    </AuthCard>
  );
}
