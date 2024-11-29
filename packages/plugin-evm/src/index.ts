export * from './actions/bridge'
export * from './actions/swap'
export * from './actions/transfer'
export * from './providers/wallet'
export * from './types'

import type { Plugin } from '@ai16z/eliza'
import { bridgeAction } from './actions/bridge'
import { swapAction } from './actions/swap'
import { transferAction } from './actions/transfer'
import { evmWalletProvider } from './providers/wallet'

export * from "./providers/token.ts";
export * from "./providers/trustScoreProvider.ts";
export * from "./evaluators/trust.ts";

import { executeSwap} from "./actions/swap";
import { ContractEvaluator } from "./evaluators/contractEvaluator";
import { contractProvider } from "./providers/contractProvider";
import {learnContractAction, callContractAction} from "@/actions/contractActions";

export { Contr, WalletProvider };

export const evmPlugin: Plugin = {
  name: 'evm',
  description: 'EVM blockchain integration plugin',
  providers: [evmWalletProvider, contractProvider],
  evaluators: [ContractEvaluator],
  services: [],
  actions: [transferAction, bridgeAction, swapAction, learnContractAction, callContractAction]
}

export default evmPlugin