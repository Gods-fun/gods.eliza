import { http, PublicClient, createPublicClient, createWalletClient } from 'viem';
import { mainnet, base, arbitrum } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

type SupportedChainId = 1 | 8453 | 42161;

class WalletProvider {
    private chains: Map<SupportedChainId, typeof mainnet|typeof base|typeof arbitrum>;
    private rpcUrls: Map<SupportedChainId, string>;

    constructor() {
        this.chains = new Map([
            [1, mainnet],
            [8453, base],
            [42161, arbitrum]
        ]);

        this.rpcUrls = new Map([
            [1, process.env.ETHEREUM_RPC_URL!],
            [8453, process.env.BASE_RPC_URL!],
            [42161, process.env.ARBITRUM_RPC_URL!]
        ]);
    }

    getProviderAndWallet(chainId: SupportedChainId, privateKey: `0x${string}`): { provider: PublicClient, wallet: Wallet } {
        const chain = this.chains.get(chainId);
        const rpcUrl = this.rpcUrls.get(chainId);

        if (!chain || !rpcUrl) {
            throw new Error(`Unsupported chain ID: ${chainId}`);
        }

        const provider = createPublicClient({
            chain,
            transport: http(rpcUrl)
        });

        const account = privateKeyToAccount(privateKey);
        const wallet = createWalletClient({
            account,
            chain,
            transport: http(rpcUrl)
        });

        return { provider, wallet };
    }
}

export const walletProvider = new WalletProvider();
