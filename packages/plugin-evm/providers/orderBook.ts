import {
    IAgentRuntime,
    Memory,
    Provider,
    State,
} from "@ai16z/eliza/src/types.ts";
import * as fs from "fs";
import settings from "@ai16z/eliza/src/settings.ts";
import {
    createPublicClient,
    http,
    Address,
    formatUnits
} from 'viem';

interface Order {
    userId: string;
    ticker: string;
    contractAddress: string;
    timestamp: string;
    buyAmount: number;
    price: number;
    chainId: number;
}

async function getCurrentPrice(
    client: ReturnType<typeof createPublicClient>,
    tokenAddress: Address
): Promise<number> {
    try {
        // Try price feed first
        const priceFeed = settings.chainConfig.priceFeeds?.[tokenAddress];
        if (priceFeed) {
            const [price, decimals] = await Promise.all([
                client.readContract({
                    address: priceFeed.address as Address,
                    abi: settings.chainConfig.priceFeeds.abi,
                    functionName: 'latestAnswer'
                }),
                client.readContract({
                    address: priceFeed.address as Address,
                    abi: settings.chainConfig.priceFeeds.abi,
                    functionName: 'decimals'
                })
            ]);
            return Number(formatUnits(price, decimals));
        }

        // Fallback to DEX price
        const router = {
            address: settings.chainConfig.dex.routerAddress as Address,
            abi: settings.chainConfig.dex.routerAbi
        };

        const amountIn = BigInt(1e18); // 1 token
        const path = [
            tokenAddress,
            settings.chainConfig.dex.wethAddress as Address
        ];

        const amounts = await client.readContract({
            ...router,
            functionName: 'getAmountsOut',
            args: [amountIn, path]
        });

        // Convert to USD using ETH price
        const ethPrice = await getEthPrice();
        const priceInEth = Number(formatUnits(amounts[1], 18));
        return priceInEth * ethPrice;

    } catch (error) {
        console.error('Error getting current price:', error);
        return 0;
    }
}

async function getEthPrice(): Promise<number> {
    try {
        const response = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
        );
        const data = await response.json();
        return data.ethereum.usd;
    } catch (error) {
        console.error('Error fetching ETH price:', error);
        return 0;
    }
}

const orderBookProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, _state?: State) => {
        const userId = message.userId;
        const chainId = message.chainId || settings.chainConfig.chain.id;

        // Initialize Viem client
        const client = createPublicClient({
            chain: settings.chainConfig.chain,
            transport: http(settings.chainConfig.rpcUrl)
        });

        // Read the order book
        const orderBookPath = settings.orderBookPath;
        let orderBook: Order[] = [];
        if (fs.existsSync(orderBookPath)) {
            const orderBookData = fs.readFileSync(orderBookPath, "utf-8");
            orderBook = JSON.parse(orderBookData);
        }

        // Filter orders for current user and chain
        const userOrders = orderBook.filter(
            (order) => order.userId === userId && order.chainId === chainId
        );

        let totalProfit = 0;
        for (const order of userOrders) {
            const currentPrice = await getCurrentPrice(
                client,
                order.contractAddress as Address
            );

            const priceDifference = currentPrice - order.price;
            const orderProfit = priceDifference * order.buyAmount;
            totalProfit += orderProfit;
        }

        const chainName = settings.chainConfig.chain.name;
        return `The user has made a total profit of $${totalProfit.toFixed(2)} for the agent on ${chainName} based on their recorded buy orders.`;
    },
};

export { orderBookProvider };
