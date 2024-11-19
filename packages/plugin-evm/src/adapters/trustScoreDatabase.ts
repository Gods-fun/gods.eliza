
import { Database } from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

// Define interfaces
export interface Recommender {
    id: string; // UUID
    address: string;
    evmAddress?: string; // Changed from solanaPubkey
    telegramId?: string;
    discordId?: string;
    twitterId?: string;
    ip?: string;
    chainId?: number; // Added chainId to track which network
}

export interface RecommenderMetrics {
    recommenderId: string;
    trustScore: number;
    totalRecommendations: number;
    successfulRecs: number;
    avgTokenPerformance: number;
    riskScore: number;
    consistencyScore: number;
    virtualConfidence: number;
    lastActiveDate: Date;
    trustDecay: number;
    lastUpdated: Date;
    chainId?: number; // Added chainId
}

export interface TokenPerformance {
    tokenAddress: string;
    chainId: number; // Added chainId
    priceChange24h: number;
    volumeChange24h: number;
    trade24hChange: number;
    liquidity: number;
    liquidityChange24h: number;
    holderChange24h: number;
    rugPull: boolean;
    isScam: boolean;
    marketCapChange24h: number;
    sustainedGrowth: boolean;
    rapidDump: boolean;
    suspiciousVolume: boolean;
    validationTrust: number;
    lastUpdated: Date;
}

export interface TokenRecommendation {
    id: string; // UUID
    recommenderId: string;
    tokenAddress: string;
    chainId: number; // Added chainId
    timestamp: Date;
    initialMarketCap?: number;
    initialLiquidity?: number;
    initialPrice?: number;
}

export interface TradePerformance {
    token_address: string;
    chainId: number; // Added chainId
    recommender_id: string;
    sell_recommender_id?: string;
    buy_price: number;
    sell_price?: number;
    buy_timeStamp: string;
    sell_timeStamp?: string;
    buy_amount: number;
    sell_amount?: number;
    buy_value_native: number; // Changed from buy_sol
    received_native?: number; // Changed from received_sol
    buy_value_usd: number;
    sell_value_usd?: number;
    profit_usd?: number;
    profit_percent?: number;
    buy_market_cap: number;
    sell_market_cap?: number;
    market_cap_change?: number;
    buy_liquidity: number;
    sell_liquidity?: number;
    liquidity_change?: number;
    last_updated: string;
    rapidDump: boolean;
    gas_used?: string; // Added gas tracking
    gas_price?: string;
}

export class TrustScoreDatabase {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
        this.initializeSchema();
    }

    private initializeSchema() {
        this.db.exec(`PRAGMA foreign_keys = ON;`);

        // Create Recommenders Table with chainId
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS recommenders (
                id TEXT PRIMARY KEY,
                address TEXT UNIQUE NOT NULL,
                evm_address TEXT UNIQUE,
                telegram_id TEXT UNIQUE,
                discord_id TEXT UNIQUE,
                twitter_id TEXT UNIQUE,
                ip TEXT,
                chain_id INTEGER
            );
        `);

        // Create RecommenderMetrics Table with chainId
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS recommender_metrics (
                recommender_id TEXT PRIMARY KEY,
                chain_id INTEGER,
                trust_score REAL DEFAULT 0,
                total_recommendations INTEGER DEFAULT 0,
                successful_recs INTEGER DEFAULT 0,
                avg_token_performance REAL DEFAULT 0,
                risk_score REAL DEFAULT 0,
                consistency_score REAL DEFAULT 0,
                virtual_confidence REAL DEFAULT 0,
                last_active_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                trust_decay REAL DEFAULT 0,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (recommender_id) REFERENCES recommenders(id) ON DELETE CASCADE
            );
        `);

        // Create TokenPerformance Table with chainId
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS token_performance (
                token_address TEXT,
                chain_id INTEGER,
                price_change_24h REAL,
                volume_change_24h REAL,
                trade_24h_change REAL,
                liquidity REAL,
                liquidity_change_24h REAL,
                holder_change_24h REAL,
                rug_pull BOOLEAN DEFAULT FALSE,
                is_scam BOOLEAN DEFAULT FALSE,
                market_cap_change24h REAL,
                sustained_growth BOOLEAN DEFAULT FALSE,
                rapid_dump BOOLEAN DEFAULT FALSE,
                suspicious_volume BOOLEAN DEFAULT FALSE,
                validation_trust REAL DEFAULT 0,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (token_address, chain_id)
            );
        `);

        // Create TokenRecommendations Table with chainId
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS token_recommendations (
                id TEXT PRIMARY KEY,
                recommender_id TEXT NOT NULL,
                token_address TEXT NOT NULL,
                chain_id INTEGER NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                initial_market_cap REAL,
                initial_liquidity REAL,
                initial_price REAL,
                FOREIGN KEY (recommender_id) REFERENCES recommenders(id) ON DELETE CASCADE,
                FOREIGN KEY (token_address, chain_id) REFERENCES token_performance(token_address, chain_id) ON DELETE CASCADE
            );
        `);

        // Create Trade Table with EVM-specific fields
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS trade (
                token_address TEXT NOT NULL,
                chain_id INTEGER NOT NULL,
                recommender_id TEXT NOT NULL,
                sell_recommender_id TEXT,
                buy_price REAL NOT NULL,
                sell_price REAL,
                buy_timeStamp TEXT NOT NULL,
                sell_timeStamp TEXT,
                buy_amount REAL NOT NULL,
                sell_amount REAL,
                buy_value_native REAL NOT NULL,
                received_native REAL,
                buy_value_usd REAL NOT NULL,
                sell_value_usd REAL,
                profit_usd REAL,
                profit_percent REAL,
                buy_market_cap REAL NOT NULL,
                sell_market_cap REAL,
                market_cap_change REAL,
                buy_liquidity REAL NOT NULL,
                sell_liquidity REAL,
                liquidity_change REAL,
                gas_used TEXT,
                gas_price TEXT,
                last_updated TEXT DEFAULT (datetime('now')),
                rapidDump BOOLEAN DEFAULT FALSE,
                PRIMARY KEY (token_address, chain_id, recommender_id, buy_timeStamp),
                FOREIGN KEY (token_address, chain_id) REFERENCES token_performance(token_address, chain_id) ON DELETE CASCADE,
                FOREIGN KEY (recommender_id) REFERENCES recommenders(id) ON DELETE CASCADE
            );
        `);

        // Create simulation trade table with the same structure
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS simulation_trade (
                token_address TEXT NOT NULL,
                chain_id INTEGER NOT NULL,
                recommender_id TEXT NOT NULL,
                sell_recommender_id TEXT,
                buy_price REAL NOT NULL,
                sell_price REAL,
                buy_timeStamp TEXT NOT NULL,
                sell_timeStamp TEXT,
                buy_amount REAL NOT NULL,
                sell_amount REAL,
                buy_value_native REAL NOT NULL,
                received_native REAL,
                buy_value_usd REAL NOT NULL,
                sell_value_usd REAL,
                profit_usd REAL,
                profit_percent REAL,
                buy_market_cap REAL NOT NULL,
                sell_market_cap REAL,
                market_cap_change REAL,
                buy_liquidity REAL NOT NULL,
                sell_liquidity REAL,
                liquidity_change REAL,
                gas_used TEXT,
                gas_price TEXT,
                last_updated TEXT DEFAULT (datetime('now')),
                rapidDump BOOLEAN DEFAULT FALSE,
                PRIMARY KEY (token_address, chain_id, recommender_id, buy_timeStamp),
                FOREIGN KEY (token_address, chain_id) REFERENCES token_performance(token_address, chain_id) ON DELETE CASCADE,
                FOREIGN KEY (recommender_id) REFERENCES recommenders(id) ON DELETE CASCADE
            );
        `);
    }

    getOrCreateRecommender(recommender: Recommender): Recommender | null {
        try {
            const transaction = this.db.transaction(() => {
                const existingRecommender = this.getRecommender(recommender.address);
                if (existingRecommender) {
                    this.initializeRecommenderMetrics(existingRecommender.id!, recommender.chainId);
                    return existingRecommender;
                }

                const newRecommenderId = this.addRecommender(recommender);
                if (!newRecommenderId) {
                    throw new Error("Failed to add new recommender.");
                }

                const metricsInitialized = this.initializeRecommenderMetrics(newRecommenderId, recommender.chainId);
                if (!metricsInitialized) {
                    throw new Error("Failed to initialize recommender metrics.");
                }

                const newRecommender = this.getRecommender(newRecommenderId);
                if (!newRecommender) {
                    throw new Error("Failed to retrieve the newly created recommender.");
                }

                return newRecommender;
            });

            return transaction();
        } catch (error) {
            console.error("Error in getOrCreateRecommender:", error);
            return null;
        }
    }

    // Modified to include chainId in metrics initialization
    initializeRecommenderMetrics(recommenderId: string, chainId?: number): boolean {
        const sql = `
            INSERT OR IGNORE INTO recommender_metrics (recommender_id, chain_id)
            VALUES (?, ?);
        `;
        try {
            const result = this.db.prepare(sql).run(recommenderId, chainId || null);
            return result.changes > 0;
        } catch (error) {
            console.error("Error initializing recommender metrics:", error);
            return false;
        }
    }

    // Modified to support chain-specific queries
    calculateValidationTrust(tokenAddress: string, chainId: number): number {
        const sql = `
            SELECT rm.trust_score
            FROM token_recommendations tr
            JOIN recommender_metrics rm ON tr.recommender_id = rm.recommender_id
            WHERE tr.token_address = ? AND tr.chain_id = ?;
        `;
        const rows = this.db.prepare(sql).all(tokenAddress, chainId) as Array<{
            trust_score: number;
        }>;

        if (rows.length === 0) return 0;

        const totalTrust = rows.reduce((acc, row) => acc + row.trust_score, 0);
        return totalTrust / rows.length;
    }

    // Add other methods with similar chain-specific modifications...

    // Add new methods for EVM-specific functionality
    async getGasHistory(tokenAddress: string, chainId: number): Promise<Array<{
        timestamp: string;
        gasUsed: string;
        gasPrice: string;
    }>> {
        const sql = `
            SELECT buy_timeStamp as timestamp, gas_used, gas_price
            FROM trade
            WHERE token_address = ? AND chain_id = ?
            ORDER BY buy_timeStamp DESC;
        `;
        return this.db.prepare(sql).all(tokenAddress, chainId);
    }

    closeConnection(): void {
        this.db.close();
    }
}
