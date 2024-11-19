// TrustScoreManager.ts
import {
    createPublicClient,
    http,
    type Address,
    type PublicClient
} from 'viem';
import { TokenProvider } from "./token";
import { ChainConfig } from '../types/types';
import {
    TrustScoreDatabase,
    RecommenderMetrics,
    TokenPerformance,
    TradePerformance,
    TokenRecommendation,
} from "../adapters/trustScoreDatabase";
import { ProcessedTokenData } from '@ai16z/core/src/types';
import { IAgentRuntime } from "@ai16z/core/src/types";
import settings from "@ai16z/core/src/settings";

interface TradeData {
    buy_amount: number;
    is_simulation: boolean;
    gasEstimate?: string;
    gasPrice?: string;
}

interface SellDetails {
    sell_amount: number;
    sell_recommender_id: string | null;
    gasEstimate?: string;
    gasPrice?: string;
}

interface RecommenderData {
    recommenderId: string;
    trustScore: number;
    riskScore: number;
    consistencyScore: number;
    recommenderMetrics: RecommenderMetrics;
}

interface TokenRecommendationSummary {
    tokenAddress: string;
    chainId: number;  // Added for EVM
    averageTrustScore: number;
    averageRiskScore: number;
    averageConsistencyScore: number;
    gasEfficiencyScore?: number;  // Added for EVM
    recommenders: RecommenderData[];
}

export class TrustScoreManager {
    private client: PublicClient;
    private tokenProvider: TokenProvider;
    private trustScoreDb: TrustScoreDatabase;
    private DECAY_RATE = 0.95;
    private MAX_DECAY_DAYS = 30;
    private chainConfig: ChainConfig;

    constructor(
        chainConfig: ChainConfig,
        tokenProvider: TokenProvider,
        trustScoreDb: TrustScoreDatabase
    ) {
        this.chainConfig = chainConfig;
        this.tokenProvider = tokenProvider;
        this.trustScoreDb = trustScoreDb;
        this.client = createPublicClient({
            chain: {
                id: chainConfig.chainId,
                name: chainConfig.name,
                nativeCurrency: chainConfig.nativeCurrency,
            },
            transport: http(chainConfig.rpcUrl)
        });
    }

    // Get recommender balance in native token
    async getRecommenderBalance(recommenderAddress: Address): Promise<number> {
        try {
            const balance = await this.client.getBalance({ address: recommenderAddress });
            return Number(balance);
        } catch (error) {
            console.error("Error fetching balance:", error);
            return 0;
        }
    }

    async generateTrustScore(
        tokenAddress: Address,
        recommenderId: string,
        recommenderAddress: Address
    ): Promise<{
        tokenPerformance: TokenPerformance;
        recommenderMetrics: RecommenderMetrics;
    }> {
        const processedData = await this.tokenProvider.getProcessedTokenData();
        const recommenderMetrics = await this.trustScoreDb.getRecommenderMetrics(recommenderId);

        // EVM-specific metrics
        const isRapidDump = await this.isRapidDump(tokenAddress);
        const sustainedGrowth = await this.sustainedGrowth(tokenAddress);
        const suspiciousVolume = await this.suspiciousVolume(tokenAddress);
        const balance = await this.getRecommenderBalance(recommenderAddress);

        // Calculate confidence based on native token balance
        const nativePrice = await this.getNativeTokenPrice();
        const balanceUSD = balance * Number(nativePrice);
        const virtualConfidence = balanceUSD / 1000; // $1000 USD baseline

        // Calculate decay
        const now = new Date();
        const lastActive = recommenderMetrics.lastActiveDate;
        const inactiveDays = Math.floor(
            (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
        );
        const decayFactor = Math.pow(
            this.DECAY_RATE,
            Math.min(inactiveDays, this.MAX_DECAY_DAYS)
        );
        const decayedScore = recommenderMetrics.trustScore * decayFactor;

        // Get validation trust score
        const validationTrustScore = this.trustScoreDb.calculateValidationTrust(
            tokenAddress,
            this.chainConfig.chainId
        );

        return {
            tokenPerformance: {
                tokenAddress,
                chainId: this.chainConfig.chainId,
                priceChange24h: processedData.tradeData.priceChange24h,
                volumeChange24h: processedData.tradeData.volumeChange24h,
                tradeChange24h: processedData.tradeData.tradeChange24h,
                liquidity: processedData.dexScreenerData.pairs[0]?.liquidity.usd || 0,
                liquidityChange24h: 0,
                holderChange24h: processedData.tradeData.holderChange24h,
                rugPull: false,
                isScam: false,
                marketCapChange24h: 0,
                sustainedGrowth,
                rapidDump: isRapidDump,
                suspiciousVolume,
                validationTrust: validationTrustScore,
                gasEfficiency: await this.calculateGasEfficiency(tokenAddress),
                lastUpdated: new Date()
            },
            recommenderMetrics: {
                recommenderId,
                chainId: this.chainConfig.chainId,
                trustScore: recommenderMetrics.trustScore,
                totalRecommendations: recommenderMetrics.totalRecommendations,
                successfulRecs: recommenderMetrics.successfulRecs,
                avgTokenPerformance: recommenderMetrics.avgTokenPerformance,
                riskScore: recommenderMetrics.riskScore,
                consistencyScore: recommenderMetrics.consistencyScore,
                virtualConfidence,
                lastActiveDate: now,
                trustDecay: decayedScore,
                lastUpdated: new Date()
            }
        };
    }

    private async calculateGasEfficiency(tokenAddress: Address): Promise<number> {
        // Implementation for calculating gas efficiency score
        // Based on historical gas usage, transaction success rate, etc.
        return 0;
    }

    private async getNativeTokenPrice(): Promise<string> {
        try {
            const response = await fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${
                    this.chainConfig.nativeCurrency.symbol.toLowerCase()
                }&vs_currencies=usd`
            );
            const data = await response.json();
            return data[this.chainConfig.nativeCurrency.symbol.toLowerCase()].usd;
        } catch (error) {
            console.error('Error fetching native token price:', error);
            return '0';
        }
    }

    // Risk calculation methods
    calculateRiskScore(tokenPerformance: TokenPerformance): number {
        let riskScore = 0;

        if (tokenPerformance.rugPull) riskScore += 10;
        if (tokenPerformance.isScam) riskScore += 10;
        if (tokenPerformance.rapidDump) riskScore += 5;
        if (tokenPerformance.suspiciousVolume) riskScore += 5;

        // EVM specific risk factors
        if (tokenPerformance.gasEfficiency < 0.5) riskScore += 3;

        return riskScore;
    }

    async createTradePerformance(
        runtime: IAgentRuntime,
        tokenAddress: Address,
        recommenderId: string,
        data: TradeData
    ): Promise<TradePerformance> {
        const processedData = await this.tokenProvider.getProcessedTokenData();
        const recommender = await this.trustScoreDb.getOrCreateRecommenderWithDiscordId(recommenderId);

        const nativePrice = await this.getNativeTokenPrice();
        const buyValueUsd = data.buy_amount * Number(nativePrice);

        const pair = processedData.dexScreenerData.pairs[0];

        const creationData: TradePerformance = {
            token_address: tokenAddress,
            chain_id: this.chainConfig.chainId,
            recommender_id: recommender.id,
            buy_price: processedData.tradeData.price,
            sell_price: 0,
            buy_timeStamp: new Date().toISOString(),
            sell_timeStamp: "",
            buy_amount: data.buy_amount,
            sell_amount: 0,
            buy_value_native: data.buy_amount,
            received_native: 0,
            buy_value_usd: buyValueUsd,
            sell_value_usd: 0,
            profit_usd: 0,
            profit_percent: 0,
            buy_market_cap: pair?.marketCap || 0,
            sell_market_cap: 0,
            market_cap_change: 0,
            buy_liquidity: pair?.liquidity.usd || 0,
            sell_liquidity: 0,
            liquidity_change: 0,
            last_updated: new Date().toISOString(),
            rapidDump: false,
            gas_used: data.gasEstimate,
            gas_price: data.gasPrice
        };

        this.trustScoreDb.addTradePerformance(creationData, data.is_simulation);

        return creationData;
    }

    // Other methods remain similar but with EVM-specific adjustments
    // ...

    // Provider export
    export const trustScoreProvider: Provider = {
        async get(runtime: IAgentRuntime, message: Memory): Promise<string> {
            try {
                const chainConfig = runtime.getSetting("chainConfig") as ChainConfig;
                const trustScoreDb = new TrustScoreDatabase(runtime.databaseAdapter.db);
                const userId = message.userId;

                if (!userId) {
                    console.error("User ID is missing from the message");
                    return "";
                }

                const recommenderMetrics = await trustScoreDb.getRecommenderMetrics(userId);
                if (!recommenderMetrics) {
                    console.error("No recommender metrics found for user:", userId);
                    return "";
                }

                const user = await runtime.databaseAdapter.getAccountById(userId);
                return `${user.name}'s trust score on ${chainConfig.name}: ${recommenderMetrics.trustScore.toFixed(2)}`;
            } catch (error) {
                console.error("Error in trust score provider:", error);
                return `Failed to fetch trust score: ${error instanceof Error ? error.message : "Unknown error"}`;
            }
        }
    };
}
