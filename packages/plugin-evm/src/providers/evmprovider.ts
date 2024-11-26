// plugin-evm/src/providers/EVMProvider.ts
/**
 * @title EVM Provider
 * @notice Manages blockchain connections using adapters
 * @dev Uses viem for blockchain interaction with adapter-based configuration
 */
import {
    createPublicClient,
    createWalletClient,
    http,
    Chain,
    Transport,
    PublicClient,
    WalletClient,
    Account
} from 'viem';
import { NetworkRegistry } from '../adapters/networkRegistry';
import { TokenRegistry } from '../adapters/tokenRegistry';

export class EVMProvider {
    private static instances: Map<number, EVMProvider> = new Map();

    public readonly chainId: number;
    public publicClient: PublicClient;
    public walletClient: WalletClient<Transport, Chain, Account>;
    private readonly networkRegistry: NetworkRegistry;
    private readonly tokenRegistry: TokenRegistry;

    private constructor(chainId: number) {
        this.chainId = chainId;
        this.networkRegistry = NetworkRegistry.getInstance();
        this.tokenRegistry = TokenRegistry.getInstance();

        // Initialize async
        this.init(chainId);
    }

    private async init(chainId: number) {
        const network = this.networkRegistry.getNetwork(chainId);
        if (!network) {
            throw new Error(`Network not found for chain ID: ${chainId}`);
        }

        if (!network.enabled) {
            throw new Error(`Network ${network.name} is currently disabled`);
        }

        const chain = {
            id: network.chainId,
            name: network.name,
            network: network.name,
            nativeCurrency: network.nativeCurrency,
            rpcUrls: {
                default: { http: [network.rpcUrl] },
                public: { http: [network.rpcUrl] }
            }
        };

        this.publicClient = createPublicClient({
            chain,
            transport: http()
        });

        this.walletClient = createWalletClient({
            chain,
            transport: http()
        });
    }

    /**
     * Get provider instance for a specific chain
     */
    public static async getProvider(chainId: number): Promise<EVMProvider> {
        if (!this.instances.has(chainId)) {
            this.instances.set(chainId, new EVMProvider(chainId));
            // Ensure initialization is complete
            await this.instances.get(chainId)!.init(chainId);
        }
        return this.instances.get(chainId)!;
    }

    /**
     * Get protocol configuration for the current network
     */
    public async getProtocolConfig() {
        return this.networkRegistry.getProtocolConfig(this.chainId);
    }

    /**
     * Get token information
     */
    public async getToken(symbol: string) {
        return this.tokenRegistry.getToken(symbol, this.chainId);
    }

    /**
     * Get all network tokens
     */
    public async getNetworkTokens() {
        return this.tokenRegistry.getNetworkTokens(this.chainId);
    }

    /**
     * Clear provider instance
     */
    public static clearProvider(chainId: number) {
        this.instances.delete(chainId);
    }

    /**
     * Clear all provider instances
     */
    public static clearAllProviders() {
        this.instances.clear();
    }
}

export { NetworkRegistry } from '../adapters/networkRegistry.ts';
export { TokenRegistry } from '../adapters/tokenRegistry.ts';
