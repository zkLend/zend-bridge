
import ZkLendLogoPath from '@assets/img/zklend.png';
import {WalletButtons} from '@features';
import {useApp, useIsL1, useMenu, useSource, useWalletLogin} from '@providers';
import {toClasses} from '@starkware-webapps/utils-browser';
import {Divider, Image, LoginWalletButton} from '@ui';

import styles from './Header.module.scss';

export const Header = () => {
  const {showSourceMenu} = useMenu();
  const {navigateToRoute} = useApp();
  const {selectDefaultSource} = useSource();
  const [, swapToL1] = useIsL1();
  const {isDisconnected} = useWalletLogin();

  const onLogoClick = () => {
    selectDefaultSource();
    swapToL1();
    showSourceMenu();
    navigateToRoute('/');
  };

  return (
    <div className={toClasses(styles.header, 'row')}>
      <div className={toClasses(styles.left, 'row')}>
        <div className={toClasses(styles.logo, 'row')} onClick={onLogoClick}>
          <Image height={40} src={ZkLendLogoPath} />
        </div>
        {/* <ChainSelect /> */}
      </div>
      <div className={toClasses(styles.right, 'row')}>
        <>
          <Divider />
          {isDisconnected ? (
            <LoginWalletButton className={styles.loginButton} />
          ) : (
            <WalletButtons />
          )}
        </>
      </div>
    </div>
  );
};
