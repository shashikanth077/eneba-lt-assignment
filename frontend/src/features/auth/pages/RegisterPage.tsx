import { Navigate, useSearchParams } from 'react-router-dom';
import { Loader } from '../../../components/common';
import { useAppSelector } from '../../../app/hooks';
import { safeNext } from '../../../utils/redirect';
import { AuthCard } from '../components/AuthCard';
import { RegisterForm } from '../components/RegisterForm';
import { selectAuthStatus } from '../authSlice';

export function RegisterPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const status = useAppSelector(selectAuthStatus);

  if (status === 'authenticated') return <Navigate to={next} replace />;
  if (status === 'unknown') return <Loader label="Checking your session…" />;

  return (
    <AuthCard title="Create your account">
      <RegisterForm next={next} />
    </AuthCard>
  );
}
