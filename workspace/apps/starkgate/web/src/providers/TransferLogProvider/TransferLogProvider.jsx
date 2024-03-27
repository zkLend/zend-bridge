import {ethers} from 'ethers';
import PropTypes from 'prop-types';
import {useCallback, useState} from 'react';

import {
  GET_PENDING_WITHDRAWALS_ENDPOINT,
  GET_TRANSFERS_ENDPOINT,
  fetchL1Transfers,
  fetchL2Transfers,
  fetchPendingWithdrawals
} from '@api';
import {RPC_PROVIDER_INFURA_API_KEY} from '@config/envs';
import {useConstants} from '@hooks';
import {TransferLogContext, useWallets} from '@providers';
import {TransferType} from '@starkgate/shared';
import {findWithdrawalInitiatedEvents} from '@starkware-webapps/web3-utils';
import {useInfiniteQuery, useQuery} from '@tanstack/react-query';

const TOO_MANY_REQUESTS = 429;
const ZEND_L1_ADDRESS = '0xb2606492712d311be8f41d940afe8ce742a52d44';
const ZEND_L2_BRIDGE_ADDRESS = '0x0616757a151c21f9be8775098d591c2807316d992bbc3bb1a5c1821630589256';
const ZEND_L1_BRIDGE_ADDRESS = '0xF5b6Ee2CAEb6769659f6C091D209DfdCaF3F69Eb';
const STARKNET_CORE_CONTRACT = '0xc662c410C0ECf747543f5bA90660f6ABeBD9C8c4';

function createL2ToL1PayloadHash(
  // l1Recipient: string,
  // l1Token: string,
  // amount: {
  //   low: string,
  //   high: string
  // }
  l1Recipient,
  amount
) {
  const msgHash = ethers.utils.keccak256(
    ethers.utils.solidityPack(
      ['uint256', 'uint256', 'uint256', 'uint256[]'],
      [
        // fromAddress (which L2 bridge it came from)
        ZEND_L2_BRIDGE_ADDRESS,
        // msg.sender (from POV of the Starknet core messaging contract)
        ZEND_L1_BRIDGE_ADDRESS,
        // payload.length
        5,
        // payload
        [
          // fromAddress
          // 0 for the zero address as the sender,
          // because it's a transfer from Starknet
          // to Ethereum
          0,
          // recipient
          l1Recipient,
          // token
          ZEND_L1_ADDRESS,
          // amount low
          amount.low,
          // amount high
          amount.high
        ]
      ]
    )
  );

  return msgHash;
}
const starknetCoreContractAbi = ['function l2ToL1Messages(bytes32) view returns (uint256)'];
const infuraProvider = new ethers.providers.JsonRpcProvider(
  `https://mainnet.infura.io/v3/${RPC_PROVIDER_INFURA_API_KEY}`
);
const starknetCoreContract = new ethers.Contract(
  STARKNET_CORE_CONTRACT,
  starknetCoreContractAbi,
  infuraProvider
);

async function findPendingWithdrawals(withdrawalsWithPayloadHash) {
  const pendingWithdrawals = [];
  const payloadHashToWithdrawalCount = {};

  for (const {withdrawal, payloadHash} of withdrawalsWithPayloadHash) {
    let sameHashPendingWithdrawalCount = 0;
    if (payloadHash in payloadHashToWithdrawalCount) {
      sameHashPendingWithdrawalCount = payloadHashToWithdrawalCount[payloadHash];
    } else {
      const count = await starknetCoreContract.l2ToL1Messages(payloadHash);
      // We just assume that not a crazy number of withdrawals are pending
      sameHashPendingWithdrawalCount = count.toNumber();
      payloadHashToWithdrawalCount[payloadHash] = sameHashPendingWithdrawalCount;
    }
    // Do not show completed withdrawals with the same hash
    if (sameHashPendingWithdrawalCount > 0) {
      const pendingWithdrawal = {
        withdrawal,
        payloadHash
      };

      pendingWithdrawals.push(pendingWithdrawal);

      payloadHashToWithdrawalCount[payloadHash] = sameHashPendingWithdrawalCount - 1;
    }
  }

  return pendingWithdrawals;
}

function mapPendingWithdrawalToOriginalStargateTransfer(pendingWithdrawal) {
  const recipient = pendingWithdrawal.withdrawal.keys[2];
  const l2Sender = pendingWithdrawal.withdrawal.keys[3];
  // [0xbeef, 0xbeef]
  const [low, high] = pendingWithdrawal.withdrawal.data;
  const [bigLow, bigHigh] = [ethers.BigNumber.from(low), ethers.BigNumber.from(high)];
  const u256Amount = bigHigh.shl(128).or(bigLow);
  const humanAmount = ethers.utils.formatUnits(u256Amount, 18);

  return {
    // Just assume one withdrawal per transaction
    id: pendingWithdrawal.withdrawal.transaction_hash,
    type: TransferType.WITHDRAWAL,
    autoWithdrawal: false,
    // We are not going to query any more from RPC
    l1TxTimestamp: 0,
    l2TxTimestamp: 0,
    name: 'zkLend Token',
    symbol: 'ZEND',
    l2TxStatus: 'ACCEPTED_ON_L1',
    l1TxHash: null,
    l1Address: recipient,
    l2Address: l2Sender,
    // transaction_hash
    l2TxHash: pendingWithdrawal.withdrawal.transaction_hash,
    // decimal adjusted amount in string (not uint256)
    amount: humanAmount,
    fullAmount: u256Amount.toString()
  };
}

export const TransferLogProvider = ({children}) => {
  const {ethereumAccount, starknetAccount} = useWallets();
  const [nextL1, setNextL1] = useState('');
  const [nextL2, setNextL2] = useState('');
  const {
    GET_TRANSFERS_MAX_RETRY,
    GET_PENDING_WITHDRAWALS_REFETCH_INTERVAL,
    GET_TRANSFERS_REFETCH_INTERVAL
  } = useConstants();

  const retryFunc = useCallback(
    (failureCount, error) =>
      error.code !== TOO_MANY_REQUESTS && failureCount < GET_TRANSFERS_MAX_RETRY,
    []
  );

  const pendingWithdrawalsQuery = useQuery({
    queryKey: [GET_PENDING_WITHDRAWALS_ENDPOINT, ethereumAccount],
    queryFn: async () => {
      const {events: zendWithdrawals} = await findWithdrawalInitiatedEvents(
        'https://starknet-mainnet.public.blastapi.io/rpc/v0_6',
        // MultiToken bridge address
        ZEND_L2_BRIDGE_ADDRESS,
        // ZEND L1 address
        ZEND_L1_ADDRESS,
        ethereumAccount,
        // ZEND L2 Deployment block
        602640
      );
      /**
       * interface ZendWithdrawal {
       *  data: [amount low, amount high]
       *  keys: [WithdrawInitiatedSelector, l1Token, l1Recipient, callerAddress]
       *  transaction_hash: string
       * }
       */
      const withdrawalsWithPayloadHash = zendWithdrawals.map(withdrawal => {
        const [amountLow, amountHigh] = withdrawal.data;
        return {
          withdrawal,
          payloadHash: createL2ToL1PayloadHash(ethereumAccount, {
            low: amountLow,
            high: amountHigh
          })
        };
      });
      const pendingWithdrawals = await findPendingWithdrawals(withdrawalsWithPayloadHash);
      const transferLogs = pendingWithdrawals.map(mapPendingWithdrawalToOriginalStargateTransfer);
      return transferLogs;
    },
    enabled: !!ethereumAccount,
    refetchInterval: GET_PENDING_WITHDRAWALS_REFETCH_INTERVAL,
    refetchOnWindowFocus: false,
    retry: retryFunc
  });

  const transfersQueryL1 = useInfiniteQuery({
    queryKey: [GET_TRANSFERS_ENDPOINT, ethereumAccount],
    queryFn: async () => {
      return [];
    },
    enabled: !!ethereumAccount,
    getNextPageParam: () => nextL1,
    refetchInterval: GET_TRANSFERS_REFETCH_INTERVAL,
    refetchOnWindowFocus: false,
    retry: retryFunc
  });

  const transfersQueryL2 = useInfiniteQuery({
    queryKey: [GET_TRANSFERS_ENDPOINT, starknetAccount],
    queryFn: async () => {
      return [];
    },
    enabled: !!starknetAccount,
    getNextPageParam: () => nextL2,
    refetchInterval: GET_TRANSFERS_REFETCH_INTERVAL,
    refetchOnWindowFocus: false,
    retry: retryFunc
  });

  const context = {
    transfersQueryL1,
    transfersQueryL2,
    pendingWithdrawalsQuery
  };

  return <TransferLogContext.Provider value={context}>{children}</TransferLogContext.Provider>;
};

TransferLogProvider.displayName = 'TransferLogProvider';

TransferLogProvider.propTypes = {
  children: PropTypes.oneOfType([PropTypes.object, PropTypes.array])
};
