import { Navigate, useSearchParams } from 'react-router-dom';
import { Loader } from '../../../components/common';
import { useAppSelector } from '../../../app/hooks';
import { safeNext } from '../../../utils/redirect';
import { AuthCard } from '../components/AuthCard';
import { LoginForm } from '../components/LoginForm';
import { selectAuthStatus } from '../authSlice';

export function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const status = useAppSelector(selectAuthStatus);

  // Signed in (also right after a successful login): go where the visitor was heading before being sent here.
  if (status === 'authenticated') return <Navigate to={next} replace />;
  if (status === 'unknown') return <Loader label="Checking your session…" />;

  return (
    <AuthCard title="Sign in" headline="Welcome back!">
      <LoginForm next={next} />
    </AuthCard>
  );
}
