import { createPublicClient, createWalletClient, http, custom, type PublicClient, type WalletClient, type Chain } from 'viem'
import { mainnet, base } from 'viem/chains'
import type { SupportedChain, ChainConfig } from '../types'
import { WalletProvider as OtherWalletProvider } from '../other-wallet-provider'

export const CHAIN_CONFIGS = {
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
} as const

export class WalletProvider {
    private chainConfigs: Record<SupportedChain, ChainConfig>
    private currentChain: SupportedChain = 'ethereum'
    private otherWalletProvider: OtherWalletProvider

    constructor(rpcUrls?: { ethereum?: string; base?: string }) {
        const createClient = (chain: Chain, rpcUrl: string): PublicClient => {
            const transport = http(rpcUrl)
            return createPublicClient({
                chain,
                transport
            })
        }

        this.chainConfigs = {
            ethereum: {
                chain: mainnet,
                publicClient: createClient(
                    mainnet,
                    rpcUrls?.ethereum || CHAIN_CONFIGS.ethereum.rpcUrl
                ),
                walletClient: undefined
            },
            base: {
                chain: base,
                publicClient: createClient(
                    base,
                    rpcUrls?.base || CHAIN_CONFIGS.base.rpcUrl
                ),
                walletClient: undefined
            }
        }

        this.otherWalletProvider = new OtherWalletProvider()
    }

    async connect(): Promise<`0x${string}`> {
        if (typeof window === 'undefined') {
            throw new Error('Window object not found')
        }

        const ethereum = (window as any).ethereum
        if (!ethereum) {
            throw new Error('No Ethereum provider found')
        }

        const walletClient = createWalletClient({
            chain: this.chainConfigs[this.currentChain].chain,
            transport: custom(ethereum)
        })

        const [address] = await walletClient.requestAddresses()
        this.chainConfigs[this.currentChain].walletClient = walletClient

        return address
    }

    getPublicClient(chain: SupportedChain): PublicClient {
        return this.chainConfigs[chain].publicClient
    }

    getWalletClient(): WalletClient {
        const walletClient = this.chainConfigs[this.currentChain].walletClient
        if (!walletClient) throw new Error('Wallet not connected')
        return walletClient
    }

    async switchChain(chain: SupportedChain): Promise<void> {
        const walletClient = this.chainConfigs[this.currentChain].walletClient
        if (!walletClient) throw new Error('Wallet not connected')

        await walletClient.switchChain({ id: CHAIN_CONFIGS[chain].chainId })
        this.currentChain = chain
    }

    getCurrentChain(): SupportedChain {
        return this.currentChain
    }

    async getOtherWalletClient(): Promise<WalletClient> {
        return this.otherWalletProvider.getWalletClient()
    }

    async switchChainWithOtherWallet(chain: SupportedChain): Promise<void> {
        await this.otherWalletProvider.switchChain(chain)
    }
}
