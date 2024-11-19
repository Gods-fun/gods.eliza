import { TokenMetadata } from '../types/types';

/**
 * @title Dynamic Token Registry
 * @notice Manages token registrations and metadata across different networks
 * @dev Thread-safe singleton pattern for token management
 */
export class TokenRegistry {
    private static instance: TokenRegistry;
    private tokens: Map<number, Map<string, TokenMetadata>>;

    private constructor() {
        this.tokens = new Map();
    }

    public static getInstance(): TokenRegistry {
        if (!TokenRegistry.instance) {
            TokenRegistry.instance = new TokenRegistry();
        }
        return TokenRegistry.instance;
    }

    /**
     * Register a new token
     * @param metadata Token metadata
     * @returns true if registration was successful
     */
    public registerToken(metadata: TokenMetadata): boolean {
        const { chainId, symbol } = metadata;

        if (!this.tokens.has(chainId)) {
            this.tokens.set(chainId, new Map());
        }

        const networkTokens = this.tokens.get(chainId)!;
        networkTokens.set(symbol.toUpperCase(), metadata);

        return true;
    }

    /**
     * Bulk register multiple tokens
     * @param tokens Array of token metadata
     * @returns number of successfully registered tokens
     */
    public registerTokens(tokens: TokenMetadata[]): number {
        let successful = 0;

        for (const token of tokens) {
            if (this.registerToken(token)) {
                successful++;
            }
        }

        return successful;
    }

    /**
     * Get token by symbol and chain ID
     */
    public getToken(symbol: string, chainId: number): TokenMetadata | undefined {
        return this.tokens.get(chainId)?.get(symbol.toUpperCase());
    }

    /**
     * Get all tokens for a specific chain
     */
    public getNetworkTokens(chainId: number): TokenMetadata[] {
        return Array.from(this.tokens.get(chainId)?.values() || []);
    }

    /**
     * Remove token from registry
     */
    public removeToken(symbol: string, chainId: number): boolean {
        return !!this.tokens.get(chainId)?.delete(symbol.toUpperCase());
    }
}
