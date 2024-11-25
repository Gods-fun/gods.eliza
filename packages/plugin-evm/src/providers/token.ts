import {
    IAgentRuntime,
    TokenData,
    Address,
    ChainConfig,
    TokenSecurityData,
    TokenTradeData
} from '../types';

import axios from 'axios';
import {
    createPublicClient,
    http,
    PublicClient,
    formatUnits
} from 'viem';
import NodeCache from "node-cache";
import * as path from "path";
import * as fs from "fs";
import { BalancesProvider } from './balancesProvider';

export class TokenProvider {
    private client: PublicClient;
    private cache: NodeCache;
    private cacheDir: string;
    private chainConfig: ChainConfig;
    private balancesProvider: BalancesProvider;

    constructor(
        chainConfig: ChainConfig,
        balancesProvider: BalancesProvider,
        cacheDir?: string
    ) {
        this.chainConfig = chainConfig;
        this.client = createPublicClient({
            chain: chainConfig.chain,
            transport: http(chainConfig.rpcUrl)
        });
        this.cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
        this.cacheDir = cacheDir || path.join(process.cwd(), '.cache');
        this.balancesProvider = balancesProvider;

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }



    async fetchTokenSecurity(): Promise<TokenSecurityData> {
        const cacheKey = `tokenSecurity_${this.tokenAddress}`;
        const cachedData = this.getCachedData<TokenSecurityData>(cacheKey);
        if (cachedData) return cachedData;

        try {
            // Get contract info using Etherscan-like API
            const contractInfo = await this.fetchContractInfo();

            // Get holder distribution using Covalent/Moralis API
            const holdersInfo = await this.fetchHolderDistribution();

            const security: TokenSecurityData = {
                ownerBalance: holdersInfo.ownerBalance,
                creatorBalance: holdersInfo.creatorBalance,
                ownerPercentage: holdersInfo.ownerPercentage,
                creatorPercentage: holdersInfo.creatorPercentage,
                top10HolderBalance: holdersInfo.top10Balance,
                top10HolderPercent: holdersInfo.top10Percentage
            };

            this.setCachedData(cacheKey, security);
            return security;
        } catch (error) {
            console.error("Error fetching token security:", error);
            throw error;
        }
    }

    async fetchTokenTradeData(): Promise<TokenTradeData> {
        const cacheKey = `tokenTradeData_${this.tokenAddress}`;
        const cachedData = this.getCachedData<TokenTradeData>(cacheKey);
        if (cachedData) return cachedData;

        try {
            // Combine data from DEX APIs (e.g., Uniswap, 1inch)
            const dexStats = await this.fetchDexStats();

            // Get additional data from subgraphs
            const graphData = await this.fetchGraphData();

            const tradeData: TokenTradeData = {
                // Map DEX and subgraph data to TokenTradeData structure
                // This will be similar but not identical to Solana structure
                // as EVM has different metrics available
            };

            this.setCachedData(cacheKey, tradeData);
            return tradeData;
        } catch (error) {
            console.error("Error fetching trade data:", error);
            throw error;
        }
    }

    async calculateBuyAmounts(): Promise<CalculatedBuyAmounts> {
        const dexData = await this.fetchDexScreenerData();
        const pair = dexData.pairs[0];
        if (!pair) {
            return { none: 0, low: 0, medium: 0, high: 0 };
        }

        const { liquidity, marketCap } = pair;
        if (!liquidity?.usd || marketCap < 100000) {
            return { none: 0, low: 0, medium: 0, high: 0 };
        }

        // Calculate impact-based amounts in native token
        const nativePrice = await this.getNativeTokenPrice();
        const impactLevels = {
            LOW: 0.01,    // 1% of liquidity
            MEDIUM: 0.05, // 5% of liquidity
            HIGH: 0.1     // 10% of liquidity
        };

        return {
            none: 0,
            low: (liquidity.usd * impactLevels.LOW) / nativePrice,
            medium: (liquidity.usd * impactLevels.MEDIUM) / nativePrice,
            high: (liquidity.usd * impactLevels.HIGH) / nativePrice
        };
    }

    // Additional helper methods...

    async getProcessedTokenData(): Promise<ProcessedTokenData> {
        try {
            const [security, tradeData, dexData] = await Promise.all([
                this.fetchTokenSecurity(),
                this.fetchTokenTradeData(),
                this.fetchDexScreenerData()
            ]);

            const holderDistributionTrend = await this.analyzeHolderDistribution(tradeData);
            const highValueHolders = await this.filterHighValueHolders(tradeData);
            const recentTrades = await this.checkRecentTrades(tradeData);
            const highSupplyHoldersCount = await this.countHighSupplyHolders(security);

            return {
                security,
                tradeData,
                holderDistributionTrend,
                highValueHolders,
                recentTrades,
                highSupplyHoldersCount,
                dexScreenerData: dexData,
                isDexScreenerListed: dexData.pairs.length > 0,
                isDexScreenerPaid: dexData.pairs.some(p => p.boosts?.active > 0)
            };
        } catch (error) {
            console.error("Error processing token data:", error);
            throw error;
        }
    }

    private async fetchContractInfo(address: Address): Promise<any> {
        const apiKey = process.env.ETHERSCAN_API_KEY;
        const url = `https://api.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=${apiKey}`;

        try {
            const response = await axios.get(url);
            if (response.data.status === '1') {
                return JSON.parse(response.data.result);
            } else {
                throw new Error(`Etherscan API error: ${response.data.message}`);
            }
        } catch (error) {
            console.error('Error fetching contract info:', error);
            throw error;
        }
    }

    private async fetchHolderDistribution(address: Address): Promise<any> {
        const apiKey = process.env.COVALENT_API_KEY;
        const url = `https://api.covalenthq.com/v1/${this.chainConfig.chainId}/tokens/${address}/token_holders/?key=${apiKey}`;

        try {
            const response = await axios.get(url);
            return response.data.data.items;
        } catch (error) {
            console.error('Error fetching holder distribution:', error);
            throw error;
        }
    }

    private async fetchDexStats(address: Address): Promise<any> {
        // This is a simplified example. You might need to integrate with specific DEX APIs or use a service like DexGuru
        const apiKey = process.env.DEXGURU_API_KEY;
        const url = `https://api.dex.guru/v1/tokens/${address}-${this.chainConfig.chainId}`;

        try {
            const response = await axios.get(url, {
                headers: { 'api-key': apiKey }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching DEX stats:', error);
            throw error;
        }
    }

    private async fetchGraphData(subgraphUrl: string, query: string): Promise<any> {
        try {
            const response = await axios.post(subgraphUrl, { query });
            return response.data.data;
        } catch (error) {
            console.error('Error fetching graph data:', error);
            throw error;
        }
    }

    private async getNativeTokenPrice(): Promise<number> {
        const coingeckoId = this.chainConfig.chainId === 1 ? 'ethereum' : 'base';
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`;

        try {
            const response = await axios.get(url);
            return response.data[coingeckoId].usd;
        } catch (error) {
            console.error('Error fetching native token price:', error);
            throw error;
        }
    }

    public async getTokenDetails(address: Address): Promise<TokenData & {
        contractInfo: any;
        holderDistribution: any;
        dexStats: any;
        price: number;
    }> {
        const [
            tokenData,
            contractInfo,
            holderDistribution,
            dexStats,
            nativePrice
        ] = await Promise.all([
            this.getTokenData(address),
            this.fetchContractInfo(address),
            this.fetchHolderDistribution(address),
            this.fetchDexStats(address),
            this.getNativeTokenPrice()
        ]);

        // Assuming the token price is in the dexStats
        const tokenPriceInNative = dexStats.priceNative || 0;
        const tokenPriceUsd = tokenPriceInNative * nativePrice;

        return {
            ...tokenData,
            contractInfo,
            holderDistribution,
            dexStats,
            price: tokenPriceUsd
        };
    }
}

// Provider export
export const tokenProvider: Provider = {
    get: async (
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<string> => {
        try {
            const chainConfig = runtime.getSetting("chainConfig") as ChainConfig;
            const balancesProvider = new BalancesProvider(chainConfig);
            const provider = new TokenProvider(
                runtime.getSetting("tokenAddress") as Address,
                chainConfig,
                balancesProvider
            );
            return provider.getFormattedTokenReport();
        } catch (error) {
            console.error("Error fetching token data:", error);
            return "Unable to fetch token information. Please try again later.";
        }
    },
};
