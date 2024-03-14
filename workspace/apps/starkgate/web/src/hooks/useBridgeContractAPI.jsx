import {BigNumber} from 'ethers';
import {useCallback} from 'react';

import {RELAYER_CONTRACT_ADDRESS} from '@config/envs';
import {
  useConstants,
  useEnvs,
  useGasCost,
  useL1TokenBridgeContract,
  useSendEthereumTransaction,
  useTeleportOracleAuthContract
} from '@hooks';
import {useEthereumWallet, useL1Token, useSelectedToken, useWallets} from '@providers';
import {Tokens} from '@starkgate/shared';
import {promiseHandler} from '@starkware-webapps/utils';
import {
  parseFromDecimals,
  parseToDecimals,
  parseToFelt,
  parseToUint256,
  sendTransactionL2
} from '@starkware-webapps/web3-utils';
import {isDai} from '@utils';

export const useBridgeContractAPI = () => {
  const {ethereumAccount, getStarknetSigner} = useWallets();
  const sendEthereumTransaction = useSendEthereumTransaction();
  const selectedToken = useSelectedToken();
  const getL1BridgeContract = useL1TokenBridgeContract();
  const getL1Token = useL1Token();
  const {TELEPORT_FEE_MULTIPLIER} = useConstants();
  const getTeleportOracleAuthContract = useTeleportOracleAuthContract();
  const fetchGasCost = useGasCost();
  const {SUPPORTED_L2_CHAIN_ID, DAI_TELEPORT_GATEWAY_CONTRACT_ADDRESS, DAI_TELEPORT_TARGET_DOMAIN} =
    useEnvs();

  const {getEthereumProvider} = useEthereumWallet();
  const estimateDepositFeeWeiFromL1Bridge = useCallback(async contract => {
    const ethProvider = getEthereumProvider();
    if (ethProvider) {
      const [estimatedDepositFee, error] = await promiseHandler(contract.estimateDepositFeeWei());
      if (error) {
        return Promise.reject(error);
      }
      return estimatedDepositFee;
    }
  }, []);

  const deposit = useCallback(
    async ({recipient, amount}) => {
      const {bridgeAddress, decimals} = selectedToken;
      const contract = await getL1BridgeContract(bridgeAddress);
      const estimatedDepositFeeWei = await estimateDepositFeeWeiFromL1Bridge(contract);
      return await sendEthereumTransaction({
        contract,
        // address token,
        // uint256 amount,
        // uint256 l2Recipient
        method: 'deposit(address,uint256,uint256)',
        args: [selectedToken.tokenAddress, parseToDecimals(amount, decimals), recipient],
        transaction: {
          from: ethereumAccount,
          value: BigNumber.from(estimatedDepositFeeWei).toString()
        }
      });
    },
    [selectedToken, ethereumAccount, getL1BridgeContract, sendEthereumTransaction]
  );

  // This function is not used anyway for zkLend, it's just a placeholder
  // to prevent any other things from breaking.
  const depositEth = useCallback(
    async ({recipient, amount}) => {
      const {bridgeAddress} = selectedToken;
      const contract = await getL1BridgeContract(bridgeAddress);
      const parsedAmount = parseToDecimals(amount);
      return await sendEthereumTransaction({
        contract,
        method: 'deposit(uint256,uint256)',
        args: [parsedAmount, recipient],
        transaction: {
          from: ethereumAccount,
          value: BigNumber.from(parsedAmount).toString()
        }
      });
    },
    [selectedToken, ethereumAccount, getL1BridgeContract, sendEthereumTransaction]
  );

  const withdraw = useCallback(
    async ({recipient, amount, symbol}) => {
      const {bridgeAddress, decimals, tokenAddress} = symbol ? getL1Token(symbol) : selectedToken;
      const contract = await getL1BridgeContract(bridgeAddress);
      return await sendEthereumTransaction({
        contract,
        // address token,
        // uint256 amount,
        // address recipient
        method: 'withdraw(address,uint256,address)',
        args: [tokenAddress, parseToDecimals(amount, decimals), recipient],
        transaction: {
          from: ethereumAccount
        }
      });
    },
    [selectedToken, getL1BridgeContract, getL1Token, sendEthereumTransaction]
  );

  const maxDeposit = useCallback(
    async token => {
      const {bridgeAddress, decimals} = token || selectedToken;
      const contract = await getL1BridgeContract(bridgeAddress);
      const [maxDeposit, error] = await promiseHandler(contract.maxDeposit());
      if (error) {
        return Promise.reject(error);
      }
      return parseFromDecimals(maxDeposit, decimals);
    },
    [selectedToken, getL1BridgeContract]
  );

  const maxTotalBalance = useCallback(async () => {
    // Multibridge at
    // https://etherscan.io/address/0xF5b6Ee2CAEb6769659f6C091D209DfdCaF3F69Eb#readProxyContract
    // doesn't have maxTotalBalance anymore, but the legacy bridge has maxTotalBalance.
    // So let this function just return the max value of uint256 for a quick fix that works
    // without having to change other lines of code.

    // const {bridgeAddress, decimals, symbol} = token || selectedToken;
    // const contract = await getL1BridgeContract(bridgeAddress);

    // const [maxTotalBalance, error] = await promiseHandler(
    //   isDai(symbol) ? contract.ceiling() : contract.maxTotalBalance()
    // );
    // if (error) {
    //   return Promise.reject(error);
    // }
    return '115792089237316195423570985008687907853269984665640564039457.584007913129639935';
  }, []);

  const initiateWithdraw = useCallback(
    async ({recipient, amount, autoWithdrawal}) => {
      const {bridgeAddress, tokenAddress, decimals, symbol} = selectedToken;
      const ethTokenAddress = Tokens.L2.ETH.tokenAddress[SUPPORTED_L2_CHAIN_ID];
      const gasCost = await (autoWithdrawal ? fetchGasCost() : Promise.resolve(0));
      const signer = await getStarknetSigner();
      const transactions = [
        ...(isDai(symbol)
          ? [
              {
                address: tokenAddress,
                method: 'increaseAllowance',
                args: {
                  spender: bridgeAddress,
                  amount: parseToUint256(amount, decimals)
                }
              }
            ]
          : []),
        ...(autoWithdrawal
          ? [
              {
                address: ethTokenAddress,
                method: 'transfer',
                args: {
                  user: parseToFelt(RELAYER_CONTRACT_ADDRESS),
                  amount: parseToUint256(parseFromDecimals(gasCost))
                }
              }
            ]
          : []),
        {
          address: bridgeAddress,
          method: 'initiate_withdraw',
          args: {
            l1Recipient: parseToFelt(recipient),
            amount: parseToUint256(amount, decimals)
          }
        }
      ];
      return sendTransactionL2(signer, transactions);
    },
    [selectedToken, fetchGasCost, getStarknetSigner]
  );

  const initiateTeleport = useCallback(
    async ({recipient, amount}) => {
      const {tokenAddress, decimals} = selectedToken;
      const signer = await getStarknetSigner();
      const transactions = [
        {
          address: tokenAddress,
          method: 'increaseAllowance',
          args: {
            spender: DAI_TELEPORT_GATEWAY_CONTRACT_ADDRESS,
            amount: parseToUint256(amount, decimals)
          }
        },
        {
          address: DAI_TELEPORT_GATEWAY_CONTRACT_ADDRESS,
          method: 'initiate_teleport',
          args: {
            target_domain: DAI_TELEPORT_TARGET_DOMAIN,
            receiver: parseToFelt(recipient),
            amount: parseToDecimals(amount, decimals),
            operator: parseToFelt(recipient)
          }
        }
      ];
      return sendTransactionL2(signer, transactions);
    },
    [selectedToken, getStarknetSigner]
  );

  const teleportThreshold = useCallback(async () => {
    const teleportOracleAuthContract = await getTeleportOracleAuthContract();
    const [threshold, error] = await promiseHandler(teleportOracleAuthContract.threshold());
    if (error) {
      return Promise.reject(error);
    }
    return threshold;
  }, [getTeleportOracleAuthContract]);

  const requestMint = useCallback(
    async ({amount, customData}) => {
      const teleportOracleAuthContract = await getTeleportOracleAuthContract();
      const {decimals} = selectedToken;
      const maxFeePercentage = parseToDecimals(
        (TELEPORT_FEE_MULTIPLIER * amount).toFixed(decimals),
        decimals
      );
      return teleportOracleAuthContract.requestMint(
        customData.teleportGUID,
        customData.signatures,
        maxFeePercentage,
        '0x0',
        {from: ethereumAccount}
      );
    },
    [getTeleportOracleAuthContract, ethereumAccount]
  );
  return {
    deposit,
    depositEth,
    withdraw,
    maxDeposit,
    maxTotalBalance,
    initiateWithdraw,
    initiateTeleport,
    teleportThreshold,
    requestMint
  };
};
