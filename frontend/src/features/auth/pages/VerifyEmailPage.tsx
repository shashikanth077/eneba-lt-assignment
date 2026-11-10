import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { Button, Loader } from '../../../components/common';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { selectAuth, verifyEmailRequest } from '../authSlice';

/** /verify-email?token=...: the target of the link in the e-mail. The server decides; this page only reports what it said. */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const dispatch = useAppDispatch();
  const { verification, status } = useAppSelector(selectAuth);

  useEffect(() => {
    if (token) dispatch(verifyEmailRequest(token));
  }, [dispatch, token]);

  if (!token) {
    return (
      <EmptyState
        title="This link is incomplete"
        description="Open the link from the verification email again, or request a new one from your account."
        action={<Button to="/">Back to the store</Button>}
      />
    );
  }
  if (verification.status === 'verified') {
    return (
      <EmptyState
        title="Your email address is verified"
        description="Thank you. Your account is fully activated."
        action={<Button to="/store">Explore the marketplace</Button>}
      />
    );
  }
  if (verification.status === 'failed') {
    return (
      <EmptyState
        title="We could not verify this link"
        description={
          verification.error?.status === 400
            ? 'It is invalid, has expired or was already used.'
            : 'Something went wrong on our side. Please try again in a moment.'
        }
        action={
          status === 'authenticated' ? (
            <Button to="/">Back to the store</Button>
          ) : (
            <Button to="/login?next=/">Sign in to request a new link</Button>
          )
        }
      />
    );
  }
  return <Loader label="Verifying your email address…" />;
}
