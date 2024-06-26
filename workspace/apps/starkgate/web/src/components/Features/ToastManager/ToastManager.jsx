import PropTypes from 'prop-types';
import {Toaster, toast} from 'react-hot-toast';
import useDeepCompareEffect from 'use-deep-compare-effect';

import {ReactComponent as FastIcon} from '@assets/svg/icons/fast.svg';
import {ToastType} from '@enums';
import {useCompleteTransferToL1, useCompleteTransferToastTranslation} from '@hooks';
import {useEthereumWallet, useIsL1, useIsL2, useMenu, useTransfers} from '@providers';
import {isDeposit, isPendingWithdrawal} from '@starkgate/shared';
import {NetworkType, isConsumed, isRejected} from '@starkware-webapps/enums';
import {useDidMountEffect, usePrevious} from '@starkware-webapps/ui';
import {getFullTime} from '@starkware-webapps/utils';
import {Bullet, CompleteTransferToL1Toast, ToastBody, TransferToast} from '@ui';

import styles from './ToastManager.module.scss';

let toastsMap = {};
let toastsDismissed = {};

export const ToastManager = () => {
  const transfers = useTransfers();
  const prevTransfers = usePrevious(transfers);
  const completeTransferToL1 = useCompleteTransferToL1();
  const {showAccountMenu} = useMenu();
  const [, swapToL1] = useIsL1();
  const [, swapToL2] = useIsL2();
  const {ethereumAccount} = useEthereumWallet();

  useDidMountEffect(() => {
    clearToasts();
  }, [ethereumAccount]);

  useDeepCompareEffect(() => {
    ethereumAccount && renderToasts();
  }, [transfers]);

  const renderToasts = () => {
    transfers.forEach(transfer => {
      const prevTransfer = prevTransfers?.find(prevTransfer => prevTransfer.id === transfer.id);
      handleToast(transfer, prevTransfer);
    });
  };

  const handleToast = (transfer, prevTransfer) => {
    const {l2TxStatus, l1TxHash, l1Address} = transfer;
    const isChanged = prevTransfer && l2TxStatus !== prevTransfer.l2TxStatus;
    // if (isChanged && isConsumed(l2TxStatus)) {
    //   return showConsumedTransferToast(transfer);
    // }
    // if (isChanged && isRejected(l2TxStatus)) {
    //   return showRejectedTransferToast(transfer);
    // }
    if (
      isPendingWithdrawal(transfer) &&
      l1Address?.toLowerCase() === ethereumAccount?.toLowerCase()
    ) {
      return showCompleteTransferToL1Toast(transfer);
    }
    // if (l1TxHash && isToastRendered(transfer.id, ToastType.COMPLETE_TRANSFER_TO_L1)) {
    //   return dismissToast(transfer.id, ToastType.COMPLETE_TRANSFER_TO_L1);
    // }
  };

  const showConsumedTransferToast = transfer => {
    const {id} = transfer;
    if (toastShouldRender(id, ToastType.CONSUMED_TRANSFER)) {
      setToast(id, ToastType.CONSUMED_TRANSFER);
      toast.success(renderTransferToast(transfer, ToastType.CONSUMED_TRANSFER), {
        id
      });
    }
  };

  const showRejectedTransferToast = transfer => {
    const {id} = transfer;
    if (toastShouldRender(id, ToastType.REJECTED_TRANSFER)) {
      setToast(id, ToastType.REJECTED_TRANSFER);
      toast.error(renderTransferToast(transfer, ToastType.REJECTED_TRANSFER), {
        id
      });
    }
  };

  const showCompleteTransferToL1Toast = transfer => {
    const {id} = transfer;
    if (toastShouldRender(id, ToastType.COMPLETE_TRANSFER_TO_L1)) {
      setToast(id, ToastType.COMPLETE_TRANSFER_TO_L1);
      toast.custom(t => renderCompleteTransferToL1Toast(t, transfer), {
        id
      });
    }
  };

  const renderTransferToast = (transfer, type) => (
    <TransferToast
      isLoading={false}
      transfer={transfer}
      onClose={() => dismissToast(transfer.id, type)}
      onTransferLogLinkClick={() => goToTransferLog(transfer)}
    />
  );

  const renderCompleteTransferToL1Toast = (t, transfer) => {
    const type = ToastType.COMPLETE_TRANSFER_TO_L1;
    const {id} = transfer;
    return (
      <CompleteTransferToL1Toast
        t={t}
        transfer={transfer}
        onClose={() => dismissToast(id, type)}
        onCompleteTransfer={() => onCompleteTransferClick(transfer)}
        onDismiss={() => dismissToast(id, type)}
        onTransferLogLinkClick={() => goToTransferLog(transfer)}
      />
    );
  };

  const toastShouldRender = (id, type) => {
    return !isToastRendered(id, type) && !isToastDismissed(id, type);
  };

  const isToastRendered = (id, type) => {
    return toastsMap[type]?.[id];
  };

  const isToastDismissed = (id, type) => {
    return toastsDismissed[type]?.[id];
  };

  const setToast = (id, type) => {
    toastsMap[type] = toastsMap[type] || {};
    toastsMap[type][id] = true;
  };

  const dismissToast = (id, type) => {
    toastsDismissed[type] = toastsDismissed[type] || {};
    toastsDismissed[type][id] = true;
    toast.dismiss(id);
  };

  const onCompleteTransferClick = async transfer => {
    await completeTransferToL1(transfer);
    dismissToast(transfer.id);
  };

  const goToTransferLog = ({id, type}) => {
    isDeposit(type) ? swapToL1() : swapToL2();
    showAccountMenu({transferId: id});
  };

  const clearToasts = () => {
    Object.values(toastsMap).forEach(toasts => {
      Object.keys(toasts).forEach(id => {
        toast.dismiss(id);
      });
    });
    toastsMap = {};
    toastsDismissed = {};
  };

  return (
    <Toaster
      containerClassName={styles.toastManager}
      containerStyle={{
        zIndex: 1
      }}
      position="top-right"
      toastOptions={{
        duration: Infinity
      }}
    />
  );
};

export const TransferData = ({transfer}) => {
  const {type, l1TxTimestamp, l2TxTimestamp} = transfer;
  const {fastIndicationTxt} = useCompleteTransferToastTranslation();
  const bodyStyle = {
    fontSize: '12px',
    lineHeight: '18px',
    paddingRight: '0',
    display: 'flex'
  };
  const time = isDeposit(type) ? l1TxTimestamp : l2TxTimestamp;

  return (
    <>
      <ToastBody
        body={
          <>
            {isDeposit(type)
              ? `${NetworkType.L1} -> ${NetworkType.L2}`
              : `${NetworkType.L2} -> ${NetworkType.L1}`}
            {transfer.fastWithdrawal && (
              <div className={styles.fastIndication}>
                <FastIcon />
                <div className={styles.fastIndicationText}>{fastIndicationTxt}</div>
              </div>
            )}
          </>
        }
        style={bodyStyle}
      />
      <div style={{display: 'flex', alignItems: 'center'}}>
        {time !== 0 && <ToastBody body={getFullTime(time)} style={bodyStyle} />}
        <Bullet />
        <ToastBody body={`${transfer.amount} ${transfer.symbol}`} style={bodyStyle} />
      </div>
    </>
  );
};

TransferData.propTypes = {
  transfer: PropTypes.object
};
