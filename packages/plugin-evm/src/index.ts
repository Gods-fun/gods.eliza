import {c} from "vite/dist/node/types.d-aGj9QkWt";

export * from "./providers/token.ts";
export * from "./providers/wallet";
export * from "./providers/trustScoreProvider.ts";
export * from "./evaluators/trust.ts";

import { Plugin } from "@ai16z/eliza";
import { executeSwap} from "./actions/swap";
import { walletProvider } from "./providers/wallet";
import { ContractEvaluator } from "./evaluators/contractEvaluator";
import { contractProvider } from "./providers/contractProvider";
import {learnContractAction, callContractAction} from "@/actions/contractActions";

export { Contr, WalletProvider };

export const evmPlugin: Plugin = {
    name: "evm",
    description: "EVM Plugin for Eliza",
    actions: [
        executeSwap,
        learnContractAction,
        callContractAction
    ],
    evaluators: [ContractEvaluator],
    providers: [walletProvider, contractProvider],
};

export default solanaPlugin;