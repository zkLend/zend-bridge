# zend-bridge

This is a fork of Starkgate to enable the transfer of ZEND. Originally, the code written for Stargate only supports the [legacy bridge](https://github.com/starknet-io/starkgate-contracts/blob/v2.0/src/solidity/LegacyBridge.sol). This fork modifies a little bit of code to support [StarkTokenBridge](https://github.com/starknet-io/starkgate-contracts/blob/v2.0/src/solidity/StarknetTokenBridge.sol), which is a generic bridge that can support multiple tokens in contrast to the legacy bridge that can only support a token per bridge.

Both L1→L2 and L2->L1 transfers of ZEND token are supported.

## Warning

This bridge is meant to be a temporary measure until https://starkgate.starknet.io/ officially supports ZEND token. The code qualitiy is not maintained at its best and things might break.

## Development

Currently, Goerli is almost near the end of its life, and most RPC nodes and explorers are not really keen on maintaining the sync with it. However, very unfortunately Starkgate hasn't deployed [`StarknetTokenBridge`](https://github.com/starknet-io/starkgate-contracts/blob/v2.0/src/solidity/StarknetTokenBridge.sol) on Sepolia, so Goerli needs to be used.

You can check the list of addresses at https://github.com/starknet-io/starknet-addresses/blob/master/bridged_tokens/sepolia.json and wait for [`MultiBridge`](https://github.com/starknet-io/starknet-addresses/blob/1f3988f76dae9196e33d8a7d0b2623b783bf8ecc/bridged_tokens/goerli.json#L119) to be added to `sepolia.json`.

To faciliate testing, an ERC20 `MockZend` contract was deployed to [0x7b1bf875977e4124dc781153bd6393c8e1c22739](https://goerli.etherscan.io/address/0x7b1bf875977e4124dc781153bd6393c8e1c22739#code) on Goerli and `enrollTokenBridge` was called to add the token to [`StarknetTokenBridge`](https://github.com/starknet-io/starkgate-contracts/blob/v2.0/src/solidity/StarknetTokenBridge.sol). You can verify that `MockZend` has been added by calling `get_l2_token(0x7b1bF875977E4124dc781153BD6393c8e1C22739)` at https://testnet.starkscan.co/contract/0x0627582c893c1506750d28a40a2e781031554c16544ff7b390c117978bc03de7#read-write-contract, which should return `0x501ac4f2b0e06a088fc71e009ae54bc3c89ffca7b24b7e27a7966449d88ed6b` which is the L2 token address for `MockZend`.

However, even the sync between Goerli Starknet and Goerli Ethereum is extremely slow, and the bridge transaction will at least take several hours to see the result on the other side.

Therefore, zkLend team has decided to test directly on mainnet, which turns out to be the easiest way. **Testing on Goerli is not recommended**. But if you need testing on Goerli, you can mint `MockZend` freely at https://goerli.etherscan.io/address/0x7b1bf875977e4124dc781153bd6393c8e1c22739#writeContract by calling `freeMint` or `freeMintWithAmount`. Optimistically, we will just wait for Starknet team to deploy the bridge contract on Sepolia.
