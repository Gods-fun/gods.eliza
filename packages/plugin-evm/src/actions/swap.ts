import {
    Action,
    ActionExample,
    Content,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    Handler,
    Validator,
    State,
} from "@ai16z/eliza";
import { composeContext, generateText, parseJSONObjectFromText } from "@ai16z/eliza";
import { parseUnits, formatUnits } from 'viem';
import { TokenRegistry } from '../adapters/tokenRegistry';
import { NetworkRegistry } from '../adapters/networkRegistry';
import { EVMProvider } from '../providers/evmprovider';

export const swapTemplate = `# Messages we are searching for a swap
{{recentMessages}}

# Instructions: {{senderName}} is requesting to swap tokens. Determine the following:
1. Source token (the token they want to swap from)
2. Target token (the token they want to swap to)
3. Amount to swap
4. Network to use (if specified, default to "mainnet")

Your response must be formatted as a JSON block with this structure:
\`\`\`json
{
  "fromToken": "<Token Symbol>",
  "toToken": "<Token Symbol>",
  "amount": "<Amount as string>",
  "network": "<Network Name>"
}
\`\`\`
`;

interface SwapParams {
    fromToken: string;
    toToken: string;
    amount: string;
    network: string;
}

const getSwapParams = async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State
): Promise<SwapParams | null> => {
    if (!state) {
        state = (await runtime.composeState(message)) as State;
    }

    const context = composeContext({
        state,
        template: swapTemplate,
    });

    for (let i = 0; i < 3; i++) {
        const response = await generateText({
            runtime,
            context,
            modelClass: ModelClass.SMALL,
        });

        const parsedResponse = parseJSONObjectFromText(response) as SwapParams | null;
        if (
            parsedResponse?.fromToken &&
            parsedResponse?.toToken &&
            parsedResponse?.amount
        ) {
            return {
                ...parsedResponse,
                network: parsedResponse.network || 'mainnet'
            };
        }
    }
    return null;
};

async function validateSwapParams(params: SwapParams): Promise<void> {
    const networkRegistry = NetworkRegistry.getInstance();
    const tokenRegistry = TokenRegistry.getInstance();

    // Get network
    const networks = await networkRegistry.getNetworks();
    const network = networks.find(n => n.name.toLowerCase() === params.network.toLowerCase());
    if (!network) {
        throw new Error(`Network ${params.network} is not supported`);
    }

    // Validate tokens exist on the network
    const fromToken = await tokenRegistry.getToken(params.fromToken, network.chainId);
    const toToken = await tokenRegistry.getToken(params.toToken, network.chainId);

    if (!fromToken) {
        throw new Error(`Token ${params.fromToken} not supported on ${params.network}`);
    }
    if (!toToken) {
        throw new Error(`Token ${params.toToken} not supported on ${params.network}`);
    }

    // Validate amount format
    try {
        parseUnits(params.amount, fromToken.decimals);
    } catch (e) {
        throw new Error(`Invalid amount format for ${params.fromToken}`);
    }
}

const validate: Validator = async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State
): Promise<boolean> => {
    if (message.content.source !== "discord") {
        return false;
    }

    const text = message.content.text.toLowerCase();
    const swapKeywords = ['swap', 'trade', 'exchange'];

    // Look for token symbols
    const hasTokenSymbols = /\b(eth|weth|usdc|dai|usdt|matic|usdbc)\b/i.test(text);

    // Look for amounts
    const hasAmount = /\d+(\.\d+)?\s*(eth|weth|usdc|dai|usdt|matic|usdbc)/i.test(text);

    return swapKeywords.some(keyword => text.includes(keyword)) &&
        hasTokenSymbols &&
        hasAmount;
};

const handler: Handler = async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,  // Added options parameter
    callback: HandlerCallback
): Promise<Content> => {
    try {
        const params = await getSwapParams(runtime, message, state);
        if (!params) {
            throw new Error("Couldn't understand swap details. Please specify tokens and amount clearly.");
        }

        await validateSwapParams(params);

        const networkRegistry = NetworkRegistry.getInstance();
        const networks = await networkRegistry.getNetworks();
        const network = networks.find(n => n.name.toLowerCase() === params.network.toLowerCase())!;

        const provider = await EVMProvider.getProvider(network.chainId);
        const protocolConfig = await provider.getProtocolConfig();
        if (!protocolConfig) {
            throw new Error(`No DEX protocol configured for ${params.network}`);
        }

        const tokenRegistry = TokenRegistry.getInstance();
        const fromToken = await tokenRegistry.getToken(params.fromToken, network.chainId);
        const toToken = await tokenRegistry.getToken(params.toToken, network.chainId);

        if (!fromToken || !toToken) {
            throw new Error('Token configuration not found');
        }

        // Parse amount with correct decimals and format for display
        const amountIn = parseUnits(params.amount, fromToken.decimals);
        const formattedAmount = formatUnits(amountIn, fromToken.decimals);

        const response: Content = {
            text: `Preparing swap on ${network.name}:\n` +
                `Amount: ${formattedAmount} ${params.fromToken}\n` +
                `To: ${params.toToken}\n` +
                `Protocol: ${protocolConfig.version}\n` +
                `Fee: ${protocolConfig.defaultFeeBps / 100}%\n\n` +
                `Would you like me to execute this swap? (Reply with 'yes' to proceed)`,
            action: "SWAP_TOKEN_QUOTE",
            source: message.content.source,
            metadata: {
                params,
                fromToken,
                toToken,
                network
            }
        };

        await callback(response);
        return response;

    } catch (error) {
        const response: Content = {
            text: `Error: ${error.message}`,
            source: message.content.source,
        };
        await callback(response);
        return response;
    }
};

const swapAction: Action = {
    name: "SWAP_TOKEN",
    similes: [
        "SWAP",
        "TRADE",
        "EXCHANGE",
    ],
    description: "Swaps between supported tokens on EVM networks",
    validate,
    handler,
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "I want to swap 10 ETH for DAI on mainnet",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Preparing swap on mainnet:\nAmount: 10 ETH\nTo: DAI\nProtocol: v3\nFee: 0.3%\n\nWould you like me to execute this swap? (Reply with 'yes' to proceed)",
                    action: "SWAP_TOKEN_QUOTE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "swap 100 USDC for ETH on base",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Preparing swap on base:\nAmount: 100 USDC\nTo: ETH\nProtocol: v3\nFee: 0.3%\n\nWould you like me to execute this swap? (Reply with 'yes' to proceed)",
                    action: "SWAP_TOKEN_QUOTE",
                },
            },
        ],
    ] as ActionExample[][],
};

export default swapAction;
