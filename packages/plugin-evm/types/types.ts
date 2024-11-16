import { type Address } from 'viem';

export interface TokenSecurityData {
    ownerBalance: string;
    deployerBalance: string;  // Changed from creatorBalance for EVM
    ownerPercentage: number;
    deployerPercentage: number;  // Changed from creatorPercentage
    top10HolderBalance: string;
    top10HolderPercent: number;
    contractVerified: boolean;  // Added for EVM
    isProxy: boolean;          // Added for EVM
    implementation?: string;   // Added for EVM
    renounced: boolean;       // Added for EVM
    hasEmergencyWithdraw: boolean; // Added for EVM
}

export interface TokenTradeData {
    address: Address;
    chainId: number;
    holder: number;
    market: number;
    lastTradeTimestamp: number;
    price: number;
    priceHistory: {
        [timeframe: string]: {  // '5m', '15m', '1h', '4h', '1d'
            price: number;
            priceChange: number;
            volume: number;
            volumeUsd: number;
            txCount: number;
            uniqueWallets: number;
            buys: number;
            sells: number;
        }
    };
    liquidityHistory: {
        [timeframe: string]: {
            liquidityUsd: number;
            liquidityChange: number;
        }
    };
    pairData: {
        dexId: string;
        pairAddress: Address;
        baseToken: Address;
        quoteToken: Address;
        priceUsd: string;
        liquidity: {
            usd: number;
            base: number;
            quote: number;
        };
        volume: {
            h1: number;
            h24: number;
        };
        priceChange: {
            h1: number;
            h24: number;
        };
        txns: {
            h1: { buys: number; sells: number };
            h24: { buys: number; sells: number };
        };
    }[];
    gasStats: {  // Added for EVM
        averageGasUsed: string;
        maxGasUsed: string;
        failedTxCount: number;
        successRate: number;
    };
}

export interface CalculatedBuyAmounts {
    none: number;
    low: number;
    medium: number;
    high: number;
    estimatedGas?: {  // Added for EVM
        none: string;
        low: string;
        medium: string;
        high: string;
    };
}

export interface ProcessedTokenData {
    security: TokenSecurityData;
    tradeData: TokenTradeData;
    holderDistribution: {
        trend: 'increasing' | 'decreasing' | 'stable';
        topHolders: Array<{
            address: Address;
            balanceUsd: string;
            isContract: boolean;  // Added for EVM
            isLocked: boolean;   // Added for EVM
            lockEndTime?: number; // Added for EVM
        }>;
    };
    recentActivity: {
        trades: boolean;
        rugPull: boolean;
        honeypot: boolean;      // Added for EVM
        blacklisted: boolean;   // Added for EVM
    };
    dexInfo: {
        listedDexCount: number;
        totalLiquidityUsd: number;
        largestPool: {
            dex: string;
            liquidityUsd: number;
            pairAddress: Address;
        };
        hasStablePair: boolean;
    };
    riskMetrics: {  // Added for EVM
        mintable: boolean;
        pausable: boolean;
        hasBlacklist: boolean;
        maxTxAmount?: string;
        maxWalletAmount?: string;
        buyTax?: number;
        sellTax?: number;
        renouncedOwnership: boolean;
        hasEmergencyWithdraw: boolean;
    };
    chainSpecific: {  // Added for EVM
        chainId: number;
        implementation?: Address;  // For proxy contracts
        verified: boolean;
        compilerVersion?: string;
        license?: string;
        gasEfficiency: {
            averageGasUsed: string;
            failureRate: number;
        };
    };
}

// Additional EVM-specific types
export interface ContractMetadata {
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: string;
    owner: Address;
    implementation?: Address;
    verified: boolean;
    license?: string;
    compiler?: string;
}

export interface TokenPair {
    pairAddress: Address;
    dex: string;
    token0: Address;
    token1: Address;
    reserve0: string;
    reserve1: string;
    liquidityUsd: number;
}

export interface GasInfo {
    gasPrice: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    estimatedGas: string;
}

export interface ChainConfig {
    chainId: number;
    name: string;
    rpcUrl: string;
    nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
    };
    blockExplorer: string;
    contracts?: {
        [key: string]: string;
    };
}

export interface TokenBalance {
    token: string;
    symbol: string;
    balance: string;
    decimals: number;
    price: string;
    value: string;
}

export interface WalletPortfolio {
    totalValue: string;
    nativeBalance: string;
    tokens: TokenBalance[];
}

export interface PriceData {
    [symbol: string]: {
        usd: string;
    };
}
