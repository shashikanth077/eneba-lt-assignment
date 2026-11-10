import { Link } from 'react-router-dom';
import { Logo } from '../Logo';
import { PageContainer } from '../PageContainer';
import { AccountMenu } from './AccountMenu';
import { CartButton } from './CartButton';
import { SearchBox } from './SearchBox';
import styles from './Header.module.scss';

/**
 * Mobile first: logo and actions on the first row, the search box full width under them.
 * From the md breakpoint everything sits on one row: logo | search | cart | account.
 */
export function Header() {
  return (
    <header className={styles.header}>
      <PageContainer>
        <div className={styles.grid}>
          <Link to="/" className={styles.logo} aria-label="KEYMART home">
            <Logo size={40} />
          </Link>
          <div className={styles.search}>
            <SearchBox />
          </div>
          <div className={styles.actionsArea}>
            <CartButton />
            <AccountMenu />
          </div>
        </div>
      </PageContainer>
    </header>
  );
}
