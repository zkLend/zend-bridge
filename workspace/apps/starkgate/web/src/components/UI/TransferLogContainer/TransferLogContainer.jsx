import PropTypes from 'prop-types';
import React, {useState} from 'react';

import {useTransferLogContainerTranslation} from '@hooks';
import {useMenu} from '@providers';
import {CollapseExpand, Loading, LoadingType} from '@ui';

import styles from './TransferLogContainer.module.scss';

export const TransferLogContainer = ({
  transferIndex,
  isError,
  isLoading,
  onShowTransfers,
  onScrollEnd,
  children
}) => {
  const {resetMenuProps} = useMenu();
  const {
    titleTxt,
    singleOverviewTxt,
    overviewTxt,
    errorMsgTxt,
    emptyMsgTxt,
    viewMoreTxt,
    viewLessTxt
  } = useTransferLogContainerTranslation();
  const [showChildren, setShowChildren] = useState(false);

  const toggleShowChildren = () => {
    const show = !showChildren;
    transferIndex > -1 ? resetMenuProps() : setShowChildren(show);
    show && onShowTransfers();
  };

  const handleScroll = ({target: {scrollHeight, scrollTop, clientHeight}}) => {
    const scrollEnd = scrollHeight - scrollTop === clientHeight;
    if (scrollEnd) {
      onScrollEnd();
    }
  };

  const renderChildren = () => {
    if (isError) {
      return <div className={styles.error}>{errorMsgTxt}</div>;
    }
    if (!children) {
      return <div className={styles.empty}>{emptyMsgTxt}</div>;
    }

    return (
      <div className={styles.viewMore}>
        {Array.isArray(children) && children.length > 1
          ? `${children.length} ${overviewTxt}`
          : `1 ${singleOverviewTxt}`}{' '}
        <span onClick={toggleShowChildren}>{showChildren ? viewLessTxt : viewMoreTxt}</span>
        {(showChildren || transferIndex > -1) && (
          <div className={styles.logsContainer}>
            <div className={styles.overflow} onScroll={handleScroll}>
              <div className={styles.logsDimensions}>{children}</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.transferLogContainer}>
      <div className={styles.title}>
        {titleTxt}
        {children && <CollapseExpand isCollapsed={showChildren} onClick={toggleShowChildren} />}
      </div>
      <span className={styles.readyWithdrawalOnly}>
        {
          "Withdrawals will only appear here once they are ready for completion. If you don't find your withdrawal here, please check back later as it means the transaction is still processing."
        }
      </span>
      {isLoading ? <Loading type={LoadingType.LINEAR} /> : renderChildren()}
    </div>
  );
};

TransferLogContainer.propTypes = {
  transferIndex: PropTypes.number,
  isError: PropTypes.bool,
  isLoading: PropTypes.bool,
  onShowTransfers: PropTypes.func,
  onScrollEnd: PropTypes.func,
  children: PropTypes.oneOfType([PropTypes.array, PropTypes.object])
};
