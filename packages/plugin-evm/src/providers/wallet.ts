import {
    createPublicClient,
    createWalletClient,
    http,
    custom,
    PublicClient,
    WalletClient,
    Chain,
} from "viem";
import { mainnet, base } from "viem/chains";
import {
    SupportedChain,
    ChainConfig,
    Address
} from "../types";

const CHAIN_CONFIGS: Record<SupportedChain, Omit<ChainConfig, 'publicClient' | 'walletClient'>> = {
    ethereum: {
        chainId: 1,
        chain: mainnet,
        rpcUrl: 'https://eth.llamarpc.com'
    },
    base: {
        chainId: 8453,
        chain: base,
        rpcUrl: 'https://base.llamarpc.com'
    }
};

export class WalletProvider {
    private chainConfigs: Record<SupportedChain, ChainConfig>;
    private currentChain: SupportedChain = "ethereum";

    constructor(rpcUrls?: Partial<Record<SupportedChain, string>>) {
        this.chainConfigs = Object.entries(CHAIN_CONFIGS).reduce((acc, [chainName, config]) => {
            const chain = chainName as SupportedChain;
            acc[chain] = {
                ...config,
                publicClient: this.createPublicClient(config.chain, rpcUrls?.[chain] || config.rpcUrl),
                walletClient: undefined
            };
            return acc;
        }, {} as Record<SupportedChain, ChainConfig>);
    }

    private createPublicClient(chain: Chain, rpcUrl: string): PublicClient {
        return createPublicClient({
            chain,
            transport: http(rpcUrl)
        });
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
            chain: this.chainConfigs[this.currentChain].chain,
            transport: custom(ethereum),
        });

        const [address] = await walletClient.requestAddresses();
        this.chainConfigs[this.currentChain].walletClient = walletClient;

        return address;
    }

    getPublicClient(chain: SupportedChain): PublicClient {
        return this.chainConfigs[chain].publicClient;
    }

    getWalletClient(): WalletClient {
        const walletClient = this.chainConfigs[this.currentChain].walletClient;
        if (!walletClient) throw new Error("Wallet not connected");
        return walletClient;
    }

    async switchChain(chain: SupportedChain): Promise<void> {
        const walletClient = this.getWalletClient();
        await walletClient.switchChain({ id: this.chainConfigs[chain].chainId });
        this.currentChain = chain;
    }

    getCurrentChain(): SupportedChain {
        return this.currentChain;
    }
}
