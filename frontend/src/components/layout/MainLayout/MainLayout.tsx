import { Outlet, useLocation } from 'react-router-dom';
import { useBootstrapAuth } from '../../../features/auth/useBootstrapAuth';
import { ToastRegion } from '../../feedback/Toast';
import { CheckoutHeader } from '../CheckoutHeader';
import { Footer } from '../Footer';
import { Header } from '../Header';
import { Navigation } from '../Navigation';
import { PageContainer } from '../PageContainer';
import styles from './MainLayout.module.scss';

/** Screens that use the reduced checkout header (and a compact footer). */
const CHECKOUT_PATHS = ['/cart', '/checkout', '/payment'];

/** The frame every page lives in: skip link, header, category bar, the routed page, footer, and the toast region. */
export function MainLayout() {
  useBootstrapAuth(); // find out once whether the browser already has a session
  const { pathname } = useLocation();
  const checkout = CHECKOUT_PATHS.some((prefix) => pathname.startsWith(prefix));

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      {checkout ? (
        <CheckoutHeader />
      ) : (
        <>
          <Header />
          <Navigation />
        </>
      )}
      <main id="main" tabIndex={-1} className={styles.main}>
        <PageContainer>
          <Outlet />
        </PageContainer>
      </main>
      <Footer compact={checkout} />
      <ToastRegion />
    </div>
  );
}
