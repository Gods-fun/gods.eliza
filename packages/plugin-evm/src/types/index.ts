import type { Address, Hash, PublicClient, WalletClient } from 'viem'
import type { mainnet, base } from 'viem/chains'
import type { Token } from '@lifi/types'

// Chain types
export type SupportedChain = 'ethereum' | 'base'

export interface ChainConfig {
    chain: typeof mainnet | typeof base
    publicClient: PublicClient
    walletClient?: WalletClient
}

// Configuration types
export interface EvmPluginConfig {
    rpcUrl?: {
        ethereum?: string
        base?: string
    }
    testMode?: boolean
}

// Provider types
export interface TokenProviderConfig {
    chain: SupportedChain
    tokenAddress: Address
    walletAddress: Address
}

export interface BalanceProviderConfig {
    chain: SupportedChain
    address: Address
}

// Transaction types
export interface Transaction {
    hash: Hash
    from: Address
    to: Address
    value: bigint
    data?: `0x${string}`
}

export interface TransferParams {
    fromChain: SupportedChain
    toAddress: Address
    amount: string
    data?: string
}

export interface SwapParams {
    chain: SupportedChain
    fromToken: Address
    toToken: Address
    amount: string
    slippage?: number
}

export interface BridgeParams {
    fromChain: SupportedChain
    toChain: SupportedChain
    fromToken: Address
    toToken: Address
    toAddress: Address
    amount: string
}

export interface CrossChainSwapParams {
    fromChain: SupportedChain
    toChain: SupportedChain
    fromToken: Address
    toToken: Address
    amount: string
    slippage?: number
}

// Balance types
export interface TokenData extends Token {
    symbol: string
    decimals: number
    address: Address
    name: string
    logoURI?: string
    chainId: number
}

export interface TokenBalance extends TokenData {
    balance: bigint
    price?: string
    value?: string
}

export interface WalletBalance {
    chain: SupportedChain
    address: Address
    totalValueUSD: string
    tokens: TokenBalance[]
}

// LiFi types
export type LiFiStatus = {
    status: 'PENDING' | 'DONE' | 'FAILED'
    substatus?: string
    error?: Error
}

export type LiFiRoute = {
    transactionHash: Hash
    transactionData: `0x${string}`
    toAddress: Address
}

export type LiFiExecutionResult = {
    transactionHash: Hash
    transactionData: `0x${string}`
    toAddress: Address
    status: LiFiStatus
}

export type SwapContext = {
    fromToken: Address
    toToken: Address
    amount: string
    chain: SupportedChain
}

export type CrossChainSwapContext = {
    fromToken: Address
    toToken: Address
    amount: string
    fromChain: SupportedChain
    toChain: SupportedChain
}

// Provider response types
export interface TokenPriceResponse {
    priceUSD: string
    token: TokenData
}

export interface TokenListResponse {
    tokens: TokenData[]
}

// Error types
export interface ProviderError extends Error {
    code?: number
    data?: unknown
}
