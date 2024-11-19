import {
    createPublicClient,
    createWalletClient,
    custom,
    parseUnits,
    http,
    type Address,
    encodeFunctionData
} from 'viem';
import settings from "@ai16z/eliza/src/settings.ts";
import {
    ActionExample,
    Content,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    type Action,
} from "@ai16z/eliza/src/types.ts";
import { composeContext } from "@ai16z/eliza/src/context.ts";
import { generateObject } from "@ai16z/eliza/src/generation.ts";

export interface TransferContent extends Content {
    tokenAddress: string;
    recipient: string;
    amount: string | number;
}

const erc20Abi = [
    {
        inputs: [
            { name: "recipient", type: "address" },
            { name: "amount", type: "uint256" }
        ],
        name: "transfer",
        outputs: [{ name: "success", type: "bool" }],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [],
        name: "decimals",
        outputs: [{ type: "uint8" }],
        stateMutability: "view",
        type: "function"
    }
] as const;

function isTransferContent(
    content: any
): content is TransferContent {
    console.log("Content for transfer", content);
    return (
        typeof content.tokenAddress === "string" &&
        typeof content.recipient === "string" &&
        (typeof content.amount === "string" || typeof content.amount === "number")
    );
}

const transferTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "tokenAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "recipient": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "amount": "100"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested token transfer:
- Token contract address
- Recipient wallet address
- Amount to transfer

Respond with a JSON markdown block containing only the extracted values.`;

export default {
    name: "SEND_TOKEN",
    similes: ["TRANSFER_TOKEN", "TRANSFER_TOKENS", "SEND_TOKENS", "SEND_ETH", "PAY"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        console.log("Validating transfer from user:", message.userId);
        // Add custom validate logic here
        return true;
    },
    description: "Transfer tokens from the agent's wallet to another address",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        console.log("Starting TRANSFER_TOKEN handler...");

        // Initialize or update state
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        // Compose transfer context
        const transferContext = composeContext({
            state,
            template: transferTemplate,
        });

        // Generate transfer content
        const content = await generateObject({
            runtime,
            context: transferContext,
            modelClass: ModelClass.SMALL,
        });

        // Validate transfer content
        if (!isTransferContent(content)) {
            console.error("Invalid content for TRANSFER_TOKEN action.");
            if (callback) {
                callback({
                    text: "Unable to process transfer request. Invalid content provided.",
                    content: { error: "Invalid transfer content" }
                });
            }
            return false;
        }

        try {
            const publicClient = createPublicClient({
                chain: settings.chainConfig.chain,
                transport: http(settings.chainConfig.rpcUrl)
            });

            const walletClient = createWalletClient({
                chain: settings.chainConfig.chain,
                transport: custom(window.ethereum)
            });

            const walletAddress = runtime.getSetting("WALLET_ADDRESS") as `0x${string}`;
            const recipient = content.recipient as `0x${string}`;
            const tokenAddress = content.tokenAddress as `0x${string}`;

            // Check if we're transferring native token or ERC20
            if (tokenAddress.toLowerCase() === settings.chainConfig.nativeCurrency.address.toLowerCase()) {
                // Transfer native token (ETH/MATIC/etc.)
                const txHash = await walletClient.sendTransaction({
                    to: recipient,
                    value: parseUnits(content.amount.toString(), settings.chainConfig.nativeCurrency.decimals)
                });

                // Wait for transaction
                const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

                if (receipt.status === "success") {
                    callback?.({
                        text: `Successfully transferred ${content.amount} ${settings.chainConfig.nativeCurrency.symbol} to ${content.recipient}\nTransaction: ${txHash}`,
                        content: {
                            success: true,
                            hash: txHash,
                            amount: content.amount,
                            recipient: content.recipient
                        }
                    });
                    return true;
                } else {
                    throw new Error("Transaction failed");
                }
            } else {
                // Transfer ERC20 token
                // First get token decimals
                const decimals = await publicClient.readContract({
                    address: tokenAddress,
                    abi: erc20Abi,
                    functionName: 'decimals'
                });

                const txHash = await walletClient.writeContract({
                    address: tokenAddress,
                    abi: erc20Abi,
                    functionName: 'transfer',
                    args: [recipient, parseUnits(content.amount.toString(), decimals)]
                });

                // Wait for transaction
                const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

                if (receipt.status === "success") {
                    callback?.({
                        text: `Successfully transferred ${content.amount} tokens to ${content.recipient}\nTransaction: ${txHash}`,
                        content: {
                            success: true,
                            hash: txHash,
                            amount: content.amount,
                            recipient: content.recipient
                        }
                    });
                    return true;
                } else {
                    throw new Error("Transaction failed");
                }
            }
        } catch (error) {
            console.error("Error during token transfer:", error);
            if (callback) {
                callback({
                    text: `Error transferring tokens: ${error.message}`,
                    content: { error: error.message }
                });
            }
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Send 100 USDC 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
                }
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll send 100 USDC now...",
                    action: "SEND_TOKEN"
                }
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully sent 100 USDC to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e\nTransaction: 0x123..."
                }
            }
        ]
    ] as ActionExample[][]
} as Action;
