import {NetworkMetadata, ProtocolConfig} from "../types/types.ts";

/**
 * @title Dynamic Network Registry
 * @notice Manages network configurations and metadata
 * @dev Thread-safe singleton pattern for network management
 */
export class NetworkRegistry {
    private static instance: NetworkRegistry;
    private networks: Map<number, NetworkMetadata>;
    private protocols: Map<number, ProtocolConfig>;

    private constructor() {
        this.networks = new Map();
        this.protocols = new Map();
    }

    public static getInstance(): NetworkRegistry {
        if (!NetworkRegistry.instance) {
            NetworkRegistry.instance = new NetworkRegistry();
        }
        return NetworkRegistry.instance;
    }

    /**
     * Register a new network
     * @param metadata Network metadata
     * @param protocolConfig Optional protocol configuration for DEX integration
     */
    public registerNetwork(
        metadata: NetworkMetadata,
        protocolConfig?: ProtocolConfig
    ): void {
        this.networks.set(metadata.chainId, metadata);
        if (protocolConfig) {
            this.protocols.set(metadata.chainId, protocolConfig);
        }
    }

    /**
     * Get network by chain ID
     */
    public getNetwork(chainId: number): NetworkMetadata | undefined {
        return this.networks.get(chainId);
    }

    /**
     * Get protocol config for network
     */
    public getProtocolConfig(chainId: number): ProtocolConfig | undefined {
        return this.protocols.get(chainId);
    }

    /**
     * Get all registered networks
     */
    public getNetworks(): NetworkMetadata[] {
        return Array.from(this.networks.values());
    }

    /**
     * Enable or disable a network
     */
    public setNetworkEnabled(chainId: number, enabled: boolean): boolean {
        const network = this.networks.get(chainId);
        if (network) {
            network.enabled = enabled;
            return true;
        }
        return false;
    }
}
