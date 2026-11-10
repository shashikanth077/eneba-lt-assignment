import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { Alert, Button } from '../../../components/common';
import { resendVerificationRequest, selectAuth } from '../authSlice';
import styles from './VerifyEmailBanner.module.scss';

/** For a signed-in buyer whose address is not verified yet: say so, and offer a new link. Nothing is blocked (docs/EMAIL.md). */
export function VerifyEmailBanner() {
  const dispatch = useAppDispatch();
  const { user, resend } = useAppSelector(selectAuth);
  if (!user || user.emailVerified) return null;

  return (
    <div className={styles.banner}>
      <Alert
        severity={resend.failed ? 'error' : 'info'}
        role="status"
        action={
          !resend.sent && (
            <Button
              variant="outline"
              size="sm"
              loading={resend.loading}
              onClick={() => dispatch(resendVerificationRequest())}
            >
              Send a new link
            </Button>
          )
        }
      >
        {resend.sent
          ? `We sent a new link to ${user.email}. It replaces the earlier one.`
          : resend.failed
            ? 'We could not send the email. Please try again in a little while.'
            : `Please verify your email address: open the link we sent to ${user.email}.`}
      </Alert>
    </div>
  );
}
