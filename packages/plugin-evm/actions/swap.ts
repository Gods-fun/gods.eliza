import {
    createPublicClient,
    createWalletClient,
    custom,
    parseUnits,
    formatUnits,
    encodeFunctionData,
    type PublicClient,
    type WalletClient,
    type Hash
} from 'viem';
import { v4 as uuidv4 } from "uuid";
import { TrustScoreDatabase } from "../adapters/trustScoreDatabase.ts";
import { composeContext } from "@ai16z/eliza/src/context.ts";
import { generateObject } from "@ai16z/eliza/src/generation.ts";
import settings from "@ai16z/eliza/src/settings.ts";
import {
    ActionExample,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    type Action,
} from "@ai16z/eliza/src/types.ts";
import { TokenProvider } from "../providers/token.ts";
import { TrustScoreManager } from "../providers/trustScoreProvider.ts";
import { walletProvider } from "../providers/wallet.ts";

// Uniswap V2 Router ABI (minimal)
const routerAbi = [
    {
        inputs: [
            { name: "amountIn", type: "uint256" },
            { name: "amountOutMin", type: "uint256" },
            { name: "path", type: "address[]" },
            { name: "to", type: "address" },
            { name: "deadline", type: "uint256" }
        ],
        name: "swapExactTokensForTokens",
        outputs: [{ name: "amounts", type: "uint256[]" }],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [
            { name: "amountOutMin", type: "uint256" },
            { name: "path", type: "address[]" },
            { name: "to", type: "address" },
            { name: "deadline", type: "uint256" }
        ],
        name: "swapExactETHForTokens",
        outputs: [{ name: "amounts", type: "uint256[]" }],
        stateMutability: "payable",
        type: "function"
    }
] as const;

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
            abi: [{
                inputs: [
                    { name: "amountIn", type: "uint256" },
                    { name: "path", type: "address[]" }
                ],
                name: "getAmountsOut",
                outputs: [{ name: "amounts", type: "uint256[]" }],
                stateMutability: "view",
                type: "function"
            }],
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
                abi: [{
                    inputs: [
                        { name: "spender", type: "address" },
                        { name: "amount", type: "uint256" }
                    ],
                    name: "approve",
                    outputs: [{ name: "success", type: "bool" }],
                    stateMutability: "nonpayable",
                    type: "function"
                }],
                functionName: "approve",
                args: [router, amountIn]
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
    const publicClient = createPublicClient({
        chain: settings.chainConfig.chain,
        transport: custom(window.ethereum)
    });

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
    validate: async (runtime: IAgentRuntime, message: Memory) => {
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

        const walletInfo = await walletProvider.get(runtime, message, state);
        state.walletInfo = walletInfo;

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

        const type = response.inputTokenSymbol?.toUpperCase() === settings.chainConfig.nativeCurrency.symbol ?
            "buy" : "sell";

        // Handle native token address
        if (response.inputTokenSymbol?.toUpperCase() === settings.chainConfig.nativeCurrency.symbol) {
            response.inputTokenCA = settings.chainConfig.nativeCurrency.address;
        }
        if (response.outputTokenSymbol?.toUpperCase() === settings.chainConfig.nativeCurrency.symbol) {
            response.outputTokenCA = settings.chainConfig.nativeCurrency.address;
        }

        // Resolve token addresses
        if (!response.inputTokenCA && response.inputTokenSymbol) {
            response.inputTokenCA = await getTokenFromWallet(runtime, response.inputTokenSymbol);
            if (!response.inputTokenCA) {
                callback?.({ text: "I need the contract addresses to perform the swap" });
                return true;
            }
        }

        if (!response.outputTokenCA && response.outputTokenSymbol) {
            response.outputTokenCA = await getTokenFromWallet(runtime, response.outputTokenSymbol);
            if (!response.outputTokenCA) {
                callback?.({ text: "I need the contract addresses to perform the swap" });
                return true;
            }
        }

        if (!response.amount) {
            callback?.({ text: "I need the amount to perform the swap" });
            return true;
        }

        try {
            const publicClient = createPublicClient({
                chain: settings.chainConfig.chain,
                transport: custom(window.ethereum)
            });

            const walletClient = createWalletClient({
                chain: settings.chainConfig.chain,
                transport: custom(window.ethereum)
            });

            const walletAddress = runtime.getSetting("WALLET_ADDRESS");

            const txHash = await swapToken(
                publicClient,
                walletClient,
                response.inputTokenCA as string,
                response.outputTokenCA as string,
                response.amount as number,
                walletAddress
            );

            // Wait for transaction
            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

            if (receipt.status === "success") {
                // Handle TrustScore updates similar to original code
                if (type === "buy") {
                    const tokenProvider = new TokenProvider(response.outputTokenCA);
                    const module = await import("better-sqlite3");
                    const Database = module.default;
                    const trustScoreDb = new TrustScoreDatabase(new Database(":memory:"));

                    const uuid = uuidv4();
                    const recommender = await trustScoreDb.getOrCreateRecommender({
                        id: uuid,
                        address: walletAddress,
                        evmAddress: walletAddress,
                    });

                    const trustScoreDatabase = new TrustScoreManager(tokenProvider, trustScoreDb);

                    await trustScoreDatabase.createTradePerformance(
                        runtime,
                        response.outputTokenCA,
                        recommender.id,
                        {
                            buy_amount: response.amount,
                            is_simulation: false,
                        }
                    );
                }

                callback?.({ text: `Swap completed successfully! Transaction hash: ${txHash}` });
                return true;
            } else {
                throw new Error("Transaction failed");
            }
        } catch (error) {
            console.error("Error during token swap:", error);
            callback?.({ text: `Swap failed: ${error.message}` });
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    inputTokenSymbol: "ETH",
                    outputTokenSymbol: "USDC",
                    amount: 0.1,
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Swapping 0.1 ETH for USDC...",
                    action: "TOKEN_SWAP",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Swap completed successfully! Transaction hash: ...",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
