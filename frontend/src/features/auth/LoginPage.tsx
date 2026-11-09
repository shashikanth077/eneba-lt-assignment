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
import { DEFAULT_AFTER_LOGIN, safeNext } from '../../lib/redirect';
import { AuthCard } from './AuthCard';
import { validateLogin } from './validation';
import { useLoginMutation } from './authApi';

export function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const status = useAppSelector((state) => state.auth.status);
  const [login, { isLoading, error }] = useLoginMutation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Client-side messages appear once a field was left or the form was submitted (not while someone is still typing the first character).
  const [touched, setTouched] = useState({ email: false, password: false });
  const [attempted, setAttempted] = useState(false);

  // Signed in (also right after a successful login): go where the visitor was heading before being sent here.
  if (status === 'authenticated') return <Navigate to={next} replace />;
  if (status === 'unknown') return <LoadingState label="Checking your session…" />;

  const fields = getFieldErrors(error);
  const problems = validateLogin({ email, password });
  const shown = (name: 'email' | 'password') =>
    attempted || touched[name] ? problems[name] : undefined;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(problems).length > 0) return;
    void login({ email: email.trim(), password });
  };

  return (
    <AuthCard title="Sign in">
      <Box component="form" onSubmit={submit} noValidate sx={{ display: 'grid', gap: 2 }}>
        {error && Object.keys(fields).length === 0 && (
          <Alert severity="error">{describeError(error)}</Alert>
        )}
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
          autoFocus
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={Boolean(shown('password') ?? fields.password)}
          helperText={shown('password') ?? fields.password?.[0] ?? ' '}
          required
        />
        <Button type="submit" variant="contained" size="large" disabled={isLoading}>
          {isLoading ? 'Signing in…' : 'Sign in'}
        </Button>
        <Typography color="text.secondary">
          New here?{' '}
          <Link
            component={RouterLink}
            to={
              next === DEFAULT_AFTER_LOGIN
                ? '/register'
                : `/register?next=${encodeURIComponent(next)}`
            }
          >
            Create an account
          </Link>
        </Typography>
      </Box>
    </AuthCard>
  );
}
