
typescript
CopyInsert
// packages/plugin-evm/src/actions/swap.ts

import {
    Action,
    ActionExample,
    Content,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    SwapParams,
    TokenData,
    LiFiExecutionResult,
    SwapContent,
    PublicClient,
    WalletClient,
    Address
} from '../types'
import { TokenRegistry } from '../adapters/tokenRegistry'
import { NetworkRegistry } from '../adapters/networkRegistry'
import { composeContext } from "../utils/context"
import { generateObject } from "../utils/generation"
import { createPublicClient, createWalletClient, http, custom } from 'viem'

const swapTemplate = `Given the recent messages and wallet information below:

{{recentMessages}}

{{walletInfo}}

Extract the following information about the requested token swap:
- Input token address
- Output token address
- Amount to swap
- Chain ID (1 for Ethereum, 8453 for Base)
- Protocol (LiFi or Uniswap)
- Slippage tolerance (optional)

Respond with a JSON markdown block containing only the extracted values:

\`\`\`json
{
    "inputToken": "0x...",
    "outputToken": "0x...",
    "amount": "string",
    "chainId": number,
    "chain": "ethereum" | "base" | null,
    "protocol": "LiFi" | "Uniswap",
    "slippage": number | null
}
\`\`\`
`

export const swapAction: Action = {
    name: "SWAP_TOKENS",
    similes: ["TRADE", "EXCHANGE", "SWAP"],
    description: "Swap tokens using either LiFi or Uniswap",

    validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
        console.log("Validating swap request from user:", message.userId)
        // Add custom validation logic here
        return true
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<Content> => {
        try {
            // Initialize or update state
            if (!state) {
                state = await runtime.composeState(message)
            } else {
                state = await runtime.updateRecentMessageState(state)
            }

            // Generate swap parameters from context
            const swapContext = composeContext({
                state,
                template: swapTemplate,
            })

            const content = await generateObject({
                runtime,
                context: swapContext,
                modelClass: ModelClass.SMALL,
            }) as SwapContent

            // Validate content
            if (!isValidSwapContent(content)) {
                throw new Error("Invalid swap parameters provided")
            }

            // Get network configuration
            const network = NetworkRegistry.getInstance().getNetwork(content.chainId)
            if (!network) {
                throw new Error(`Unsupported chain ID: ${content.chainId}`)
            }

            // Create clients
            const publicClient = createPublicClient({
                chain: network.chain,
                transport: http(network.rpcUrl)
            })

            const walletClient = createWalletClient({
                chain: network.chain,
                transport: custom(window.ethereum)
            })

            const [fromAddress] = await walletClient.getAddresses()

            // Execute swap based on protocol
            const transaction = await (content.protocol === 'LiFi'
                ? executeLiFiSwap(content, publicClient, walletClient, fromAddress)
                : executeUniswapSwap(content, publicClient, walletClient, fromAddress))

            // Return the result
            return {
                action: 'SWAP_TOKEN_QUOTE',
                text: `Swap executed successfully. Transaction hash: ${transaction.hash}`,
                data: transaction
            }
        } catch (error) {
            console.error("Error in swap handler:", error)
            return {
                action: 'SWAP_TOKEN_QUOTE',
                text: `Error executing swap: ${error.message}`,
                error: error
            }
        }
    },

    examples: [
        {
            user: "{{user1}}",
            agent: "Certainly! I'd be happy to help you swap tokens. Could you please provide me with the following information:\n\n1. The token you want to swap from (input token)\n2. The token you want to swap to (output token)\n3. The amount you want to swap\n4. The chain you want to perform the swap on (Ethereum or Base)\n5. Your preferred protocol (LiFi or Uniswap)\n6. Optional: Your preferred slippage tolerance\n\nOnce you provide this information, I can assist you with the swap process.",
            user: "I want to swap 100 USDC for ETH on Ethereum using Uniswap with 0.5% slippage.",
            agent: "Thank you for providing the details. I'll process your swap request now.\n\n```json\n{\n    \"inputToken\": \"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48\",\n    \"outputToken\": \"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2\",\n    \"amount\": \"100\",\n    \"chainId\": 1,\n    \"chain\": \"ethereum\",\n    \"protocol\": \"Uniswap\",\n    \"slippage\": 0.5\n}\n```\n\nI've prepared the swap parameters based on your request. Here's a summary:\n\n- Swapping 100 USDC to ETH\n- On the Ethereum network (Chain ID: 1)\n- Using Uniswap protocol\n- With a slippage tolerance of 0.5%\n\nShall I proceed with executing this swap for you?",
            user: "Yes, please proceed with the swap.",
            agent: "Certainly! I'll initiate the swap process for you right away. Please allow me a moment to execute the transaction.\n\n[Swap execution in progress...]\n\nGreat news! The swap has been successfully executed. Here are the details of the transaction:\n\nSwap executed successfully. Transaction hash: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef\n\nYou can use this transaction hash to track the status of your swap on Etherscan or any other Ethereum block explorer. The swapped ETH should appear in your wallet shortly.\n\nIs there anything else you would like me to help you with regarding cryptocurrency swaps or other blockchain operations?"
        }
    ] as ActionExample[]
}

function isValidSwapContent(content: SwapContent): boolean {
    // Implement validation logic
    return true
}

async function executeLiFiSwap(content: SwapContent, publicClient: PublicClient, walletClient: WalletClient, fromAddress: Address): Promise<LiFiExecutionResult> {
    // Implement LiFi swap logic
    return {} as LiFiExecutionResult
}

async function executeUniswapSwap(content: SwapContent, publicClient: PublicClient, walletClient: WalletClient, fromAddress: Address): Promise<LiFiExecutionResult> {
    // Implement Uniswap swap logic
    return {} as LiFiExecutionResult
}
