// packages/plugin-evm/src/providers/orderBook.ts

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
    createWalletClient,
    http,
    Address,
    formatUnits,
    parseUnits,
    encodeFunctionData,
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

        const router = {
            address: settings.chainConfig.dex.routerAddress as Address,
            abi: settings.chainConfig.dex.routerAbi
        };

        const amountIn = BigInt(1e18);
        const path = [
            tokenAddress,
            settings.chainConfig.dex.wethAddress as Address
        ];

        const amounts = await client.readContract({
            ...router,
            functionName: 'getAmountsOut',
            args: [amountIn, path]
        });

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

const loadOrderBook = (): Order[] => {
    const orderBookPath = settings.orderBookPath;
    if (fs.existsSync(orderBookPath)) {
        const orderBookData = fs.readFileSync(orderBookPath, "utf-8");
        return JSON.parse(orderBookData);
    } else {
        return [];
    }
};

const saveOrderBook = (orderBook: Order[]): void => {
    const orderBookPath = settings.orderBookPath;
    fs.writeFileSync(orderBookPath, JSON.stringify(orderBook, null, 2), "utf-8");
};

const orderBookProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, _state?: State) => {
        const userId = message.userId;
        const chainId = message.chainId || settings.chainConfig.chain.id;

        const client = createPublicClient({
            chain: settings.chainConfig.chain,
            transport: http(settings.chainConfig.rpcUrl)
        });

        const orderBook = loadOrderBook();

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

    takeOrder: async (runtime: IAgentRuntime, message: Memory) => {
        const userId = message.userId;
        const chainId = message.chainId || settings.chainConfig.chain.id;
        const walletClient = createWalletClient({
            chain: settings.chainConfig.chain,
            transport: http(settings.chainConfig.rpcUrl)
        });

        const orderBook = loadOrderBook();

        const userOrder = orderBook.find(
            (order) => order.userId === userId && order.chainId === chainId
        );

        if (!userOrder) {
            return `No order found for user ${userId} on chain ${chainId}.`;
        }

        try {
            const tx = await walletClient.sendTransaction({
                to: userOrder.contractAddress as Address,
                value: parseUnits(userOrder.buyAmount.toString(), 18),
                data: encodeFunctionData({
                    abi: [
                        "function transfer(address to, uint256 value)"
                    ],
                    functionName: "transfer",
                    args: [userOrder.contractAddress, parseUnits(userOrder.buyAmount.toString(), 18)]
                })
            });

            const updatedOrderBook = orderBook.filter((order) => order !== userOrder);
            saveOrderBook(updatedOrderBook);

            return `Order executed successfully. Transaction hash: ${tx}.`;
        } catch (error) {
            console.error('Error executing order:', error);
            return `Failed to execute order: ${error.message}.`;
        }
    },

    addOrder: async (runtime: IAgentRuntime, message: Memory) => {
        const { userId, ticker, contractAddress, buyAmount, price, chainId } = message;

        const orderBook = loadOrderBook();

        const newOrder: Order = {
            userId,
            ticker,
            contractAddress,
            timestamp: new Date().toISOString(),
            buyAmount,
            price,
            chainId: chainId || settings.chainConfig.chain.id,
        };

        orderBook.push(newOrder);
        saveOrderBook(orderBook);

        return `Order added successfully for user ${userId}.`;
    },

    removeOrder: async (runtime: IAgentRuntime, message: Memory) => {
        const { userId, contractAddress } = message;
        const chainId = message.chainId || settings.chainConfig.chain.id;

        const orderBook = loadOrderBook();

        const updatedOrderBook = orderBook.filter(
            (order) => !(order.userId === userId && order.contractAddress === contractAddress && order.chainId === chainId)
        );

        saveOrderBook(updatedOrderBook);

        return `Order removed for user ${userId} on contract ${contractAddress}.`;
    },
};

export { orderBookProvider };
