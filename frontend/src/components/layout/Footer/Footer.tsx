import { Link } from 'react-router-dom';
import { Logo } from '../Logo';
import { PageContainer } from '../PageContainer';
import styles from './Footer.module.scss';

const COLUMNS = [
  {
    title: 'Shop',
    links: [
      { label: 'All games', to: '/store' },
      { label: 'Deals', to: '/store?sort=discount' },
      { label: 'New releases', to: '/store?sort=newest' },
      { label: 'Search', to: '/search' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign in', to: '/login' },
      { label: 'Register', to: '/register' },
      { label: 'My orders', to: '/orders' },
      { label: 'Cart', to: '/cart' },
    ],
  },
];

export function Footer({ compact = false }: { compact?: boolean }) {
  if (compact) {
    // Checkout screens keep the footer to one quiet line, as in the reference.
    return (
      <footer className={styles.compact}>
        <PageContainer>
          <small>
            © {new Date().getFullYear()} KEYMART · demo project · Stripe test mode: no real money is
            involved
          </small>
          <Link to="/store">Store</Link>
          <Link to="/orders">My orders</Link>
        </PageContainer>
      </footer>
    );
  }
  return (
    <footer className={styles.footer}>
      <PageContainer>
        <div className={styles.grid}>
          <div className={styles.about}>
            <Logo size={28} />
            <p className={styles.blurb}>
              KEYMART is a student project built for the Eneba internship assignment, styled after
              eneba.com. Payments run in Stripe test mode: no real money is involved and no real
              keys are sold.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className={styles.title}>{column.title}</h2>
              <ul className={styles.list}>
                {column.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className={styles.link}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <small className={styles.copy}>© {new Date().getFullYear()} KEYMART · demo project</small>
      </PageContainer>
    </footer>
  );
}
