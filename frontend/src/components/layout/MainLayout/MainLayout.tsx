import { Outlet } from 'react-router-dom';
import { useBootstrapAuth } from '../../../features/auth/useBootstrapAuth';
import { ToastRegion } from '../../feedback/Toast';
import { Footer } from '../Footer';
import { Header } from '../Header';
import { Navigation } from '../Navigation';
import { PageContainer } from '../PageContainer';
import styles from './MainLayout.module.scss';

/** The frame every page lives in: skip link, header, category bar, the routed page, footer, and the toast region. */
export function MainLayout() {
  useBootstrapAuth(); // find out once whether the browser already has a session

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <Header />
      <Navigation />
      <main id="main" tabIndex={-1} className={styles.main}>
        <PageContainer>
          <Outlet />
        </PageContainer>
      </main>
      <Footer />
      <ToastRegion />
    </div>
  );
}
