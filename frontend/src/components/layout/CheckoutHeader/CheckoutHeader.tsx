import { Check } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { classNames } from '../../../utils/classNames';
import { Logo } from '../Logo';
import { PageContainer } from '../PageContainer';
import styles from './CheckoutHeader.module.scss';

const STEPS = ['Cart', 'Payment', 'Get your product'] as const;

/** Which step the visitor is on, from the address. */
function currentStep(pathname: string): number {
  if (pathname.startsWith('/payment')) return 2;
  if (pathname.startsWith('/checkout')) return 1;
  return 0;
}

/** Cart, checkout and payment screens swap the full header for this reduced one: the wordmark and a three-step progress line. */
export function CheckoutHeader() {
  const step = currentStep(useLocation().pathname);
  return (
    <header className={styles.header}>
      <PageContainer>
        <div className={styles.row}>
          <Link to="/" className={styles.logo} aria-label="KEYMART home">
            <Logo size={36} />
          </Link>
          <ol className={styles.steps} aria-label="Checkout progress">
            {STEPS.map((label, index) => (
              <li
                key={label}
                className={classNames(
                  styles.item,
                  index === step && styles.active,
                  index < step && styles.done,
                )}
                aria-current={index === step ? 'step' : undefined}
              >
                <span className={styles.step}>
                  <span className={styles.number} aria-hidden="true">
                    {index < step ? <Check size={16} /> : index + 1}
                  </span>
                  <span className={index === step ? undefined : styles.label}>{label}</span>
                </span>
                {index < STEPS.length - 1 && <span className={styles.line} aria-hidden="true" />}
              </li>
            ))}
          </ol>
        </div>
      </PageContainer>
    </header>
  );
}
