import {
    createPublicClient,
    http,
    formatUnits,
    getContract,
    type Address,
    type PublicClient,
    type Chain
} from 'viem';
import { ChainConfig, TokenBalance, WalletPortfolio, PriceData } from '../types/types';

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

export class BalancesProvider {
    private client: PublicClient;
    private chainConfig: ChainConfig;

    constructor(chainConfig: ChainConfig) {
        this.chainConfig = chainConfig;
        this.client = createPublicClient({
            account: {
                address: chainConfig.contracts[0],
                type: "json-rpc";
            },
            chain: {
                id: chainConfig.chainId,
                name: chainConfig.name,
                nativeCurrency: chainConfig.nativeCurrency,
            } as Chain,
            transport: http(chainConfig.rpcUrl)
        });
    }

    async getBalances(address: Address): Promise<WalletPortfolio> {
        try {
            // Get native balance
            const nativeBalance = await this.client.getBalance({ address });
            const formattedNativeBalance = formatUnits(
                nativeBalance,
                this.chainConfig.nativeCurrency.decimals
            );

            // Get ERC20 token balances and prices
            const tokenBalances = await this.getTokenBalances(address);

            // Get native token price
            const nativePrice = await this.getNativePrice();
            const nativeValue = (
                Number(formattedNativeBalance) *
                Number(nativePrice)
            ).toString();

            // Add native token to balances
            const nativeToken: TokenBalance = {
                token: '0x0000000000000000000000000000000000000000', // ETH address convention
                symbol: this.chainConfig.nativeCurrency.symbol,
                balance: formattedNativeBalance,
                decimals: this.chainConfig.nativeCurrency.decimals,
                price: nativePrice,
                value: nativeValue
            };

            // Calculate total value
            const totalValue = [nativeValue, ...tokenBalances.map(t => t.value)]
                .reduce((sum, val) => sum + Number(val), 0)
                .toString();

            return {
                totalValue,
                nativeBalance: formattedNativeBalance,
                tokens: [nativeToken, ...tokenBalances]
            };
        } catch (error) {
            console.error('Error fetching balances:', error);
            throw error;
        }
    }

    private async getTokenBalances(address: Address): Promise<TokenBalance[]> {
        const contracts = this.chainConfig.contracts || {};
        const balances = await Promise.all(
            Object.entries(contracts)
                .filter(([key]) => key !== 'priceFeeds' && key !== 'dexRouter')
                .map(async ([symbol, tokenAddress]) => {
                    const contract = getContract({
                        address: tokenAddress as Address,
                        abi: ERC20_ABI,
                        publicClient: this.client
                    });

                    const [balance, decimals] = await Promise.all([
                        contract.read.balanceOf([address]),
                        contract.read.decimals()
                    ]);

                    const formattedBalance = formatUnits(balance, decimals);
                    const price = await this.getTokenPrice(tokenAddress as Address);
                    const value = (Number(formattedBalance) * Number(price)).toString();

                    return {
                        token: tokenAddress,
                        symbol,
                        balance: formattedBalance,
                        decimals,
                        price,
                        value
                    };
                })
        );

        return balances.filter(b => Number(b.balance) > 0);
    }

    private async getTokenPrice(tokenAddress: Address): Promise<string> {
        const priceFeeds = this.chainConfig.contracts?.priceFeeds;

        if (priceFeeds?.[tokenAddress]) {
            return this.getPriceFromOracle(tokenAddress);
        }

        return this.getPriceFromDex(tokenAddress);
    }

    private async getPriceFromOracle(tokenAddress: Address): Promise<string> {
        const feedAddress = this.chainConfig.contracts?.priceFeeds?.[tokenAddress];
        if (!feedAddress) return '0';

        try {
            const priceFeed = getContract({
                address: feedAddress as Address,
                abi: [
                    {
                        inputs: [],
                        name: "latestAnswer",
                        outputs: [{ type: "int256" }],
                        stateMutability: "view",
                        type: "function"
                    },
                    {
                        inputs: [],
                        name: "decimals",
                        outputs: [{ type: "uint8" }],
                        stateMutability: "view",
                        type: "function"
                    }
                ],
                publicClient: this.client
            });

            const [price, decimals] = await Promise.all([
                priceFeed.read.latestAnswer(),
                priceFeed.read.decimals()
            ]);

            return formatUnits(price, decimals);
        } catch (error) {
            console.error('Error getting oracle price:', error);
            return '0';
        }
    }

    private async getPriceFromDex(tokenAddress: Address): Promise<string> {
        const dexRouter = this.chainConfig.contracts?.dexRouter;
        if (!dexRouter) return '0';

        try {
            const router = getContract({
                address: dexRouter as Address,
                abi: [
                    {
                        inputs: [
                            { name: "amountIn", type: "uint256" },
                            { name: "path", type: "address[]" }
                        ],
                        name: "getAmountsOut",
                        outputs: [{ name: "amounts", type: "uint256[]" }],
                        stateMutability: "view",
                        type: "function"
                    }
                ],
                publicClient: this.client
            });

            const wrappedNative = this.chainConfig.contracts?.wrappedNative as Address;
            const path = [tokenAddress, wrappedNative];
            const amounts = await router.read.getAmountsOut([BigInt(1e18), path]);
            const nativePrice = await this.getNativePrice();

            return (Number(formatUnits(amounts[1], 18)) * Number(nativePrice)).toString();
        } catch (error) {
            console.error('Error getting DEX price:', error);
            return '0';
        }
    }

    private async getNativePrice(): Promise<string> {
        try {
            const response = await fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${
                    this.chainConfig.nativeCurrency.symbol.toLowerCase()
                }&vs_currencies=usd`
            );
            const data: PriceData = await response.json();
            return data[this.chainConfig.nativeCurrency.symbol.toLowerCase()].usd;
        } catch (error) {
            console.error('Error fetching native price:', error);
            return '0';
        }
    }

    formatBalance(portfolio: WalletPortfolio): string {
        const nativeSymbol = this.chainConfig.nativeCurrency.symbol;
        let output = `Balances on ${this.chainConfig.name}:\n`;

        // Format native balance
        const nativeToken = portfolio.tokens.find(t => t.token === '0x0000000000000000000000000000000000000000');
        if (nativeToken) {
            output += `${nativeSymbol}: ${nativeToken.balance} ($${Number(nativeToken.value).toFixed(2)})\n`;
        }

        // Format ERC20 balances
        portfolio.tokens
            .filter(t => t.token !== '0x0000000000000000000000000000000000000000')
            .forEach(token => {
                output += `${token.symbol}: ${token.balance} ($${Number(token.value).toFixed(2)})\n`;
            });

        output += `\nTotal Value: $${Number(portfolio.totalValue).toFixed(2)}`;
        return output;
    }
}
