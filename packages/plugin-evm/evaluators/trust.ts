// trustEvaluator.ts
import { createPublicClient, http, type Address } from 'viem';
import { composeContext } from "@ai16z/eliza/src/context";
import {
    generateObjectArray,
    generateTrueOrFalse,
} from "@ai16z/eliza/src/generation";
import { MemoryManager } from "@ai16z/eliza/src/memory";
import { booleanFooter } from "@ai16z/eliza/src/parsing";
import {
    ActionExample,
    Content,
    IAgentRuntime,
    Memory,
    ModelClass,
    Evaluator,
} from "@ai16z/eliza/src/types";
import { TrustScoreManager } from "../providers/trustScoreProvider";
import { TokenProvider } from "../providers/token";
import { BalancesProvider } from "../providers/balances";
import { TrustScoreDatabase } from "../adapters/trustScoreDatabase";
import { ChainConfig } from '../types/types';

// Templates remain similar but updated for EVM context
const shouldProcessTemplate =
    `# Task: Decide if the recent messages should be processed for token recommendations.

    Look for messages that:
    - Mention specific token tickers or Ethereum/EVM contract addresses (0x...)
    - Contain words related to buying, selling, or trading tokens
    - Express opinions or convictions about tokens

    Based on the following conversation, should the messages be processed for recommendations? YES or NO

    {{recentMessages}}

    Should the messages be processed for recommendations? ` + booleanFooter;

const recommendationTemplate = `TASK: Extract recommendations to buy or sell tokens from the conversation as an array of objects in JSON format.

    EVM tokens usually have a ticker and a 0x contract address. Additionally, recommenders may make recommendations with some amount of conviction. The amount of conviction in their recommendation can be none, low, medium, or high. Recommenders can make recommendations to buy, not buy, sell and not sell.

# START OF EXAMPLES
These are examples of the expected output of this task:
{{evaluationExamples}}
# END OF EXAMPLES

# INSTRUCTIONS

Extract any new recommendations from the conversation that are not already present in the list of known recommendations below:
{{recentRecommendations}}

- Include the recommender's username 
- Try not to include already-known recommendations
- Set the conviction to 'none', 'low', 'medium' or 'high'  
- Set the recommendation type to 'buy', 'dont_buy', 'sell', or 'dont_sell'
- Include the contract address (0x...) and/or ticker if available
- Include the chainId if specified

Recent Messages:
{{recentMessages}}

Response should be a JSON object array inside a JSON markdown block. Correct response format:
\`\`\`json
[
  {
    "recommender": string,
    "ticker": string | null, 
    "contractAddress": string | null,
    "chainId": number | null,
    "type": enum<buy|dont_buy|sell|dont_sell>,
    "conviction": enum<none|low|medium|high>,
    "alreadyKnown": boolean
  },
  ...  
]
\`\`\``;

async function handler(runtime: IAgentRuntime, message: Memory) {
    console.log("Evaluating for trust");
    const state = await runtime.composeState(message);
    const { agentId, roomId } = state;

    // Check if we should process the messages
    const shouldProcess = await generateTrueOrFalse({
        context: composeContext({
            state,
            template: shouldProcessTemplate,
        }),
        modelClass: ModelClass.SMALL,
        runtime,
    });

    if (!shouldProcess) {
        console.log("Skipping process");
        return [];
    }

    // Get recent recommendations
    const recommendationsManager = new MemoryManager({
        runtime,
        tableName: "recommendations",
    });

    const recentRecommendations = await recommendationsManager.getMemories({
        agentId,
        roomId,
        count: 20,
    });

    const recommendations = await generateObjectArray({
        runtime,
        context: composeContext({
            state: {
                ...state,
                recentRecommendations: formatRecommendations(recentRecommendations),
            },
            template: recommendationTemplate,
        }),
        modelClass: ModelClass.LARGE,
    });

    if (!recommendations) return [];

    // Filter valid recommendations
    const filteredRecommendations = recommendations.filter(rec => {
        return (
            !rec.alreadyKnown &&
            (rec.ticker || rec.contractAddress) &&
            rec.recommender &&
            rec.conviction &&
            rec.recommender.trim() !== ""
        );
    });

    const chainConfig = runtime.getSetting("chainConfig") as ChainConfig;
    const client = createPublicClient({
        chain: {
            id: chainConfig.chainId,
            name: chainConfig.name,
            nativeCurrency: chainConfig.nativeCurrency,
        },
        transport: http(chainConfig.rpcUrl)
    });

    for (const rec of filteredRecommendations) {
        // Create providers
        const balancesProvider = new BalancesProvider(chainConfig);
        const tokenProvider = new TokenProvider(
            rec.contractAddress as Address ?? await resolveTokenAddress(rec.ticker, chainConfig),
            chainConfig,
            balancesProvider
        );

        if (!rec.contractAddress) {
            // Try to resolve token address
            const tokenAddress = await resolveTokenAddress(rec.ticker, chainConfig);
            if (!tokenAddress) {
                console.warn("Could not find contract address for token");
                continue;
            }
            rec.contractAddress = tokenAddress;
        }

        // Initialize trust score manager
        const trustScoreDb = new TrustScoreDatabase(runtime.databaseAdapter.db);
        const trustScoreManager = new TrustScoreManager(
            chainConfig,
            tokenProvider,
            trustScoreDb
        );

        // Get user info
        const participants = await runtime.databaseAdapter.getParticipantsForRoom(message.roomId);
        const user = participants.find(async (actor) => {
            const user = await runtime.databaseAdapter.getAccountById(actor);
            return user.name.toLowerCase().trim() === rec.recommender.toLowerCase().trim();
        });

        if (!user) {
            console.warn("Could not find user:", rec.recommender);
            continue;
        }

        const account = await runtime.databaseAdapter.getAccountById(user);
        const userId = account.id;

        // Save recommendation
        await recommendationsManager.createMemory({
            userId,
            agentId,
            content: { text: JSON.stringify(rec) },
            roomId,
            createdAt: Date.now(),
        }, true);

        // Calculate buy amounts based on conviction
        const buyAmounts = await tokenProvider.calculateBuyAmounts();
        const buyAmount = buyAmounts[rec.conviction.toLowerCase().trim()] ||
            getDefaultBuyAmount(chainConfig);

        // Validate token before trading
        const shouldTrade = await tokenProvider.shouldTradeToken();
        if (!shouldTrade) {
            console.warn("Token validation failed, skipping trade");
            continue;
        }

        // Handle trade based on recommendation type
        switch (rec.type) {
            case "buy":
                await trustScoreManager.createTradePerformance(
                    runtime,
                    rec.contractAddress as Address,
                    userId,
                    {
                        buy_amount: buyAmount,
                        is_simulation: true,
                        gasEstimate: await estimateGas(client, rec.contractAddress as Address),
                        gasPrice: await client.getGasPrice()
                    }
                );
                break;
            case "sell":
            case "dont_sell":
            case "dont_buy":
                console.warn("Trade type not implemented:", rec.type);
                break;
        }
    }

    return filteredRecommendations;
}

// Helper functions
async function resolveTokenAddress(ticker: string, chainConfig: ChainConfig): Promise<Address | null> {
    // Implementation to resolve token address from ticker using:
    // 1. Chain-specific token list
    // 2. DEX pairs
    // 3. Token registry
    return null;
}

function getDefaultBuyAmount(chainConfig: ChainConfig): number {
    // Return chain-specific default amount
    return chainConfig.defaultTradeAmount || 0.1;
}

async function estimateGas(client: ReturnType<typeof createPublicClient>, tokenAddress: Address): Promise<string> {
    // Implementation to estimate gas for token operations
    return '0';
}

function formatRecommendations(recommendations: Memory[]): string {
    const messageStrings = recommendations
        .reverse()
        .map((rec: Memory) => `${(rec.content as Content)?.content}`);
    return messageStrings.join("\n");
}

// Export evaluator
export const trustEvaluator: Evaluator = {
    name: "EXTRACT_RECOMMENDATIONS",
    similes: [
        "GET_RECOMMENDATIONS",
        "EXTRACT_TOKEN_RECS",
        "EXTRACT_TOKEN_RECOMMENDATIONS"
    ],
    alwaysRun: true,
    validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
        if (message.content.text.length < 5) return false;
        return message.userId !== message.agentId;
    },
    description: "Extract recommendations to buy or sell tokens from conversations, including details like ticker, contract address, chain ID, conviction level, and recommender username.",
    handler,
    examples: [
        {
            context: `Actors in the scene:
{{user1}}: Experienced DeFi trader
{{user2}}: New to crypto

Recommendations about the actors:
None`,
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "You should check out $UNI. The Uniswap token at 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984 is looking bullish.",
                    },
                },
                {
                    user: "{{user2}}",
                    content: {
                        text: "Is it safe? How much should I buy?",
                    },
                },
                {
                    user: "{{user1}}",
                    content: {
                        text: "It's one of the most established DeFi protocols. I'm very confident in this one.",
                    },
                },
            ],
            outcome: `\`\`\`json
[
  {
    "recommender": "{{user1}}",
    "ticker": "UNI",
    "contractAddress": "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    "chainId": 1,
    "type": "buy",
    "conviction": "high",
    "alreadyKnown": false
  }
]
\`\`\``,
        }
        // Add more examples...
    ],
};
