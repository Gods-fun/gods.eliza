
import { WalletClient, PublicClient, createWalletClient, custom } from 'viem';
import { ChainConfig, Address } from '../types';

export class WalletProvider {
    private chainConfigs: Record<number, ChainConfig>;
    private currentChainId: number;

    constructor(chainConfigs: Record<number, ChainConfig>, defaultChainId: number) {
        this.chainConfigs = chainConfigs;
        this.currentChainId = defaultChainId;
    }

    private getChainConfig(chainId: number): ChainConfig {
        const config = this.chainConfigs[chainId];
        if (!config) throw new Error(`Unsupported chain ID: ${chainId}`);
        return config;
    }

    async connect(): Promise<Address> {
        if (typeof window === "undefined") {
            throw new Error("Window object not found");
        }

        const ethereum = (window as any).ethereum;
        if (!ethereum) {
            throw new Error("No Ethereum provider found");
        }

        const walletClient = createWalletClient({
            chain: this.getChainConfig(this.currentChainId).chain,
            transport: custom(ethereum),
        });

        const [address] = await walletClient.requestAddresses();
        this.chainConfigs[this.currentChainId].walletClient = walletClient;

        return address;
    }

    getPublicClient(chainId: number): PublicClient {
        return this.getChainConfig(chainId).publicClient!;
    }

    getWalletClient(): WalletClient {
        const walletClient = this.getChainConfig(this.currentChainId).walletClient;
        if (!walletClient) throw new Error("Wallet not connected");
        return walletClient;
    }

    async switchChain(chainId: number): Promise<void> {
        const walletClient = this.getWalletClient();
        await walletClient.switchChain({ id: this.getChainConfig(chainId).chainId });
        this.currentChainId = chainId;
    }

    getCurrentChainId(): number {
        return this.currentChainId;
    }
}
