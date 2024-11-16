// providers/WalletProvider.ts
import {
    createPublicClient,
    http,
    formatUnits,
    getContract,
    type Address,
    type PublicClient
} from 'viem';
import {
    ChainConfig,
    WalletPortfolio,
    TokenBalance,
    PriceData
} from '../types/types';

const ERC20_ABI = [
    {
        inputs: [{ name: "account", type: "address" }],
        name: "balanceOf",
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "decimals",
        outputs: [{ type: "uint8" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "symbol",
        outputs: [{ type: "string" }],
        stateMutability: "view",
        type: "function",
    }
] as const;

export class WalletProvider {
    private client: PublicClient;

    constructor(config: ChainConfig) {
        this.client = createPublicClient({
            chain: {
                id: config.chainId,
                name: config.name,
                nativeCurrency: config.nativeCurrency,
            },
            transport: http(config.rpcUrl)
        });
    }

    async getWalletBalance(address: Address): Promise<WalletPortfolio> {
        try {
            // Get native token balance
            const nativeBalance = await this.client.getBalance({ address });
            const formattedNativeBalance = formatUnits(
                nativeBalance,
                this.client.chain.nativeCurrency.decimals
            );

            // Get token balances for configured contracts
            const tokenBalances = await Promise.all(
                Object.entries(this.client.chain.contracts || {}).map(
                    async ([symbol, address]) => {
                        const balance = await this.getTokenBalance(
                            address as Address,
                            address
                        );
                        const price = await this.getTokenPrice(address as Address);
                        const value = (
                            Number(balance) * Number(price)
                        ).toString();

                        return {
                            token: address,
                            symbol,
                            balance,
                            decimals: await this.getTokenDecimals(address as Address),
                            price,
                            value
                        };
                    }
                )
            );

            // Get native token price and calculate value
            const nativePrice = await this.getNativeTokenPrice();
            const nativeValue = (
                Number(formattedNativeBalance) * Number(nativePrice)
            ).toString();

            // Calculate total portfolio value
            const totalValue = [nativeValue, ...tokenBalances.map(t => t.value)]
                .reduce((sum, val) => sum + Number(val), 0)
                .toString();

            return {
                totalValue,
                nativeBalance: formattedNativeBalance,
                tokens: [
                    {
                        token: '0x0', // Convention for native token
                        symbol: this.client.chain.nativeCurrency.symbol,
                        balance: formattedNativeBalance,
                        decimals: this.client.chain.nativeCurrency.decimals,
                        price: nativePrice,
                        value: nativeValue
                    },
                    ...tokenBalances
                ]
            };
        } catch (error) {
            console.error('Error getting wallet balance:', error);
            throw error;
        }
    }

    private async getTokenBalance(
        tokenAddress: Address,
        walletAddress: Address
    ): Promise<string> {
        const contract = getContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            publicClient: this.client
        });

        const [balance, decimals] = await Promise.all([
            contract.read.balanceOf([walletAddress]),
            contract.read.decimals()
        ]);

        return formatUnits(balance, decimals);
    }

    private async getTokenDecimals(tokenAddress: Address): Promise<number> {
        const contract = getContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            publicClient: this.client
        });

        return contract.read.decimals();
    }

    private async getTokenPrice(tokenAddress: Address): Promise<string> {
        // Get price from oracle if configured
        if (this.client.chain.contracts?.priceFeeds?.[tokenAddress]) {
            return this.getPriceFromOracle(tokenAddress);
        }

        // Fallback to DEX price
        return this.getPriceFromDex(tokenAddress);
    }

    private async getPriceFromOracle(tokenAddress: Address): Promise<string> {
        const priceFeed = this.client.chain.contracts?.priceFeeds[tokenAddress];
        const aggregator = getContract({
            address: priceFeed as Address,
            abi: this.client.chain.contracts?.priceOracle.abi,
            publicClient: this.client
        });

        const [price, decimals] = await Promise.all([
            aggregator.read.latestAnswer(),
            aggregator.read.decimals()
        ]);

        return formatUnits(price, decimals);
    }

    private async getPriceFromDex(tokenAddress: Address): Promise<string> {
        const dexRouter = getContract({
            address: this.client.chain.contracts?.dexRouter as Address,
            abi: this.client.chain.contracts?.dexRouterAbi,
            publicClient: this.client
        });

        const path = [
            tokenAddress,
            this.client.chain.contracts?.wrappedNative as Address
        ];

        const amounts = await dexRouter.read.getAmountsOut([
            BigInt(1e18),
            path
        ]);

        return formatUnits(amounts[1], 18);
    }

    private async getNativeTokenPrice(): Promise<string> {
        try {
            const response = await fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${
                    this.client.chain.nativeCurrency.symbol.toLowerCase()
                }&vs_currencies=usd`
            );
            const data: PriceData = await response.json();
            return data[this.client.chain.nativeCurrency.symbol.toLowerCase()].usd;
        } catch (error) {
            console.error('Error fetching native token price:', error);
            return '0';
        }
    }
}
