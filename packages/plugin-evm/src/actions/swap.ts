import {
    parseUnits,
    type PublicClient,
    type WalletClient,
    type Hash
} from 'viem';
import { v4 as uuidv4 } from "uuid";
import { TrustScoreDatabase } from "@ai16z/plugin-trustdb/src/adapters/trustScoreDatabase";
import { composeContext } from "@ai16z/eliza/src/context";
import { generateObject } from "@ai16z/eliza/src/generation";
import settings from "@ai16z/eliza/src/settings";
import {
    ActionExample,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    type Action,
} from "@ai16z/eliza/src/types";
import { TokenProvider } from "../providers/token";
import { TrustScoreManager } from "../providers/trustScoreProvider";
import { walletProvider } from "@/providers/wallet";
import {} from "../types/contracts";
import {UNISWAP_V2_ROUTER_ABI as routerAbi} from "@/providers/contracts";


async function swapToken(
    publicClient: PublicClient,
    walletClient: WalletClient,
    inputTokenCA: string,
    outputTokenCA: string,
    amount: number,
    walletAddress: string
): Promise<Hash> {
    try {
        const router = settings.chainConfig.dex.routerAddress as `0x${string}`;
        const WETH = settings.chainConfig.dex.wethAddress as `0x${string}`;

        // Get token decimals
        const decimals = inputTokenCA === settings.chainConfig.nativeCurrency.address ? 18 :
            await publicClient.readContract({
                address: inputTokenCA as `0x${string}`,
                abi: [{
                    inputs: [],
                    name: "decimals",
                    outputs: [{ type: "uint8" }],
                    stateMutability: "view",
                    type: "function"
                }],
                functionName: "decimals"
            });

        const amountIn = parseUnits(amount.toString(), decimals);

        // Get quote from DEX
        const path = inputTokenCA === settings.chainConfig.nativeCurrency.address ?
            [WETH, outputTokenCA] :
            [inputTokenCA, outputTokenCA];

        // Calculate minimum amount out with 0.5% slippage
        const amounts = await publicClient.readContract({
            address: router,
            abi: routerAbi,
            functionName: "getAmountsOut",
            args: [amountIn, path]
        });

        const amountOutMin = amounts[1] * BigInt(995) / BigInt(1000); // 0.5% slippage
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 minutes

        // Prepare transaction
        if (inputTokenCA === settings.chainConfig.nativeCurrency.address) {
            // Native token swap
            return await walletClient.writeContract({
                address: router,
                abi: routerAbi,
                functionName: "swapExactETHForTokens",
                args: [amountOutMin, path, walletAddress as `0x${string}`, deadline],
                value: amountIn
            });
        } else {
            // ERC20 swap
            // First approve router
            const approvalTx = await walletClient.writeContract({
                address: inputTokenCA as `0x${string}`,
                abi: [
                    {
                        inputs: [
                            { name: "spender", type: "address" },
                            { name: "amount", type: "uint256" },
                        ],
                        name: "approve",
                        outputs: [{ name: "success", type: "bool" }],
                        stateMutability: "nonpayable",
                        type: "function",
                    },
                ],
                functionName: "approve",
                args: [router, amountIn],
                chain: undefined,
                account: null,
            });

            // Wait for approval
            await publicClient.waitForTransactionReceipt({ hash: approvalTx });

            // Execute swap
            return await walletClient.writeContract({
                address: router,
                abi: routerAbi,
                functionName: "swapExactTokensForTokens",
                args: [amountIn, amountOutMin, path, walletAddress as `0x${string}`, deadline]
            });
        }
    } catch (error) {
        console.error("Error in swapToken:", error);
        throw error;
    }
}

// Keep the same template but update the example addresses
const swapTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "inputTokenSymbol": "ETH",
    "outputTokenSymbol": "USDC", 
    "inputTokenCA": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    "outputTokenCA": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "amount": 1.5
}
\`\`\`

{{recentMessages}}

Given the recent messages and wallet information below:

{{walletInfo}}

Extract the following information about the requested token swap:
- Input token symbol (the token being sold)
- Output token symbol (the token being bought) 
- Input token contract address if provided
- Output token contract address if provided
- Amount to swap

Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.`;

// Rest of the functions remain similar but adapted for EVM
async function getTokensInWallet(runtime: IAgentRuntime) {
    const { provider } = walletProvider.getProviderAndWallet(settings.chainConfig.chainId);

    const walletInfo = await walletProvider.get(runtime, { type: "GET_WALLET" }, {});
    return JSON.parse(walletInfo).tokens || [];
}

async function getTokenFromWallet(runtime: IAgentRuntime, tokenSymbol: string) {
    try {
        const items = await getTokensInWallet(runtime);
        const token = items.find((item) => item.symbol.toUpperCase() === tokenSymbol.toUpperCase());
        return token ? token.token : null;
    } catch (error) {
        console.error("Error checking token in wallet:", error);
        return null;
    }
}

export const executeSwap: Action = {
    name: "EXECUTE_SWAP",
    similes: ["SWAP_TOKENS", "TOKEN_SWAP", "TRADE_TOKENS", "EXCHANGE_TOKENS"],
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
        console.log("Message:", message);
        return true;
    },
    description: "Perform a token swap.",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        const swapContext = composeContext({
            state,
            template: swapTemplate,
        });

        const response = await generateObject({
            runtime,
            context: swapContext,
            modelClass: ModelClass.LARGE,
        });

        console.log("Response:", response);

        // Here, response should contain the necessary swap details
        // extracted from the user's input (message) and context (state)
        if (!response.inputTokenSymbol || !response.outputTokenSymbol || !response.amount) {
            callback?.({ text: "I couldn't determine all the necessary details for the swap. Can you please provide the input token, output token, and amount?" });
            return false;
        }

        const chainId = state.chainId || runtime.chainId; // Assuming chainId is stored in state or runtime

        const { provider, wallet } = await walletProvider.getProviderAndWallet(chainId);

        // Resolve token addresses
        const inputTokenCA = await getTokenFromWallet(runtime, response.inputTokenSymbol);
        const outputTokenCA = await getTokenFromWallet(runtime, response.outputTokenSymbol);

        if (!inputTokenCA || !outputTokenCA) {
            callback?.({ text: "I couldn't find one or both of the tokens in your wallet. Please make sure you have both tokens." });
            return false;
        }

        try {
            const tx = await swapToken(
                provider,
                wallet,
                inputTokenCA,
                outputTokenCA,
                response.amount,
                wallet.account.address
            );

            const receipt = await provider.waitForTransactionReceipt({ hash: tx });

            if (receipt.status === 'success') {
                callback?.({ text: `Swap executed successfully. Transaction hash: ${tx}` });
            } else {
                callback?.({ text: `Swap failed. Transaction hash: ${tx}` });
            }

            // Update trust score
            const trustScoreManager = new TrustScoreManager(new TrustScoreDatabase());
            await trustScoreManager.updateTrustScore(runtime.userId, 'swap', 1);

            return true;
        } catch (error) {
            console.error("Error executing swap:", error);
            callback?.({ text: `An error occurred while executing the swap: ${error.message}` });
            return false;
        }
    },
    examples: [
        {
            input: "I want to swap 0.1 ETH for USDC",
            output: "Certainly! I'll help you swap 0.1 ETH for USDC. Let me execute that swap for you.",
        },
        {
            input: "Can you exchange 100 USDC for ETH?",
            output: "Of course! I'll help you exchange 100 USDC for ETH. Let me process that swap for you.",
        },
    ] as ActionExample[][],
};

export default executeSwap;