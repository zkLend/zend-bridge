import {useEffect} from 'react';
import {Navigate, Route, Routes} from 'react-router-dom';

import {Footer, Header} from '@containers';
import {useGoogleFonts} from '@flyyer/use-googlefonts';
import {useApp, useUnsupportedModal} from '@providers';
import {Bridge} from '@routes';
import {isMobile} from '@starkware-webapps/utils-browser';
import {StyledBackground} from '@ui';

import styles from './App.module.scss';

export const App = () => {
  const {isScrollActive} = useApp();
  const showUnsupportedModal = useUnsupportedModal();
  useGoogleFonts([
    {
      family: 'Inter',
      styles: ['100..800']
    }
  ]);

  useEffect(() => {
    if (isMobile) {
      showUnsupportedModal();
    }
  }, []);

  return (
    <div className={styles.app}>
      {!isMobile && (
        <>
          <Header />
          <Footer />
          <StyledBackground withLightAccent={!isScrollActive}>
            <Routes>
              <Route element={<Bridge />} path="/" />
              <Route element={<Navigate replace to="/" />} path="*" />
            </Routes>
          </StyledBackground>
        </>
      )}
    </div>
  );
};
