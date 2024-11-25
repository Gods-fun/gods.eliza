import { createPublicClient, createWalletClient, http, custom, type PublicClient, type WalletClient, type Chain, formatUnits, parseUnits, encodeFunctionData } from 'viem'
import { TokenRegistry } from '../adapters/tokenRegistry'
import { NetworkRegistry } from '../adapters/networkRegistry'
import UniswapV2RouterABI from '../abis/UniswapV2RouterABI.json'
import UniswapV3RouterABI from '../abis/UniswapV3RouterABI.json'
import { CHAIN_CONFIGS } from '../providers/wallet'
import { SwapParams, CrossChainSwapParams } from '../types'

const SLIPPAGE_BPS = 50; // 0.5% default slippage

export class SwapUtils {
    private tokenRegistry: TokenRegistry
    private networkRegistry: NetworkRegistry

    constructor(tokenRegistry: TokenRegistry, networkRegistry: NetworkRegistry) {
        this.tokenRegistry = tokenRegistry
        this.networkRegistry = networkRegistry
    }

    async getSwapQuote(params: SwapParams): Promise<any> {
        const walletClient = createWalletClient({
            chain: CHAIN_CONFIGS[params.chain].chain,
            transport: http(CHAIN_CONFIGS[params.chain].rpcUrl)
        })

        const publicClient = createPublicClient({
            chain: CHAIN_CONFIGS[params.chain].chain,
            transport: http(CHAIN_CONFIGS[params.chain].rpcUrl)
        })

        const inputToken = this.tokenRegistry.getToken(params.inputToken, params.chain)
        const outputToken = this.tokenRegistry.getToken(params.outputToken, params.chain)

        if (!inputToken || !outputToken) {
            throw new Error('Invalid token')
        }

        const amountIn = parseUnits(params.amount, inputToken.decimals)
        const amountOut = await this.getSwapAmountOut(amountIn, inputToken, outputToken, publicClient)

        const swapTx = await walletClient.sendTransaction({
            from: walletClient.address,
            to: outputToken.address,
            value: 0,
            data: encodeFunctionData(UniswapV2RouterABI, 'swapExactTokensForTokens', [
                amountIn,
                amountOut,
                [inputToken.address, outputToken.address],
                walletClient.address,
                Math.floor(Date.now() / 1000) + 60 * 20
            ])
        })

        return swapTx
    }

    async getCrossChainSwapQuote(params: CrossChainSwapParams): Promise<any> {
        const walletClient = createWalletClient({
            chain: CHAIN_CONFIGS[params.fromChain].chain,
            transport: http(CHAIN_CONFIGS[params.fromChain].rpcUrl)
        })

        const publicClient = createPublicClient({
            chain: CHAIN_CONFIGS[params.fromChain].chain,
            transport: http(CHAIN_CONFIGS[params.fromChain].rpcUrl)
        })

        const inputToken = await this.tokenRegistry.getToken(params.fromToken)
        const outputToken = await this.tokenRegistry.getToken(params.toToken)

        if (!inputToken || !outputToken) {
            throw new Error('Invalid token')
        }

        const amountIn = parseUnits(params.amount, inputToken.decimals)
        const amountOut = await this.getSwapAmountOut(amountIn, inputToken, outputToken, publicClient)

        const bridgeTx = await walletClient.sendTransaction({
            from: walletClient.address,
            to: outputToken.address,
            value: 0,
            data: encodeFunctionData(UniswapV2RouterABI, 'swapExactTokensForTokens', [
                amountIn,
                amountOut,
                [inputToken.address, outputToken.address],
                walletClient.address,
                Math.floor(Date.now() / 1000) + 60 * 20
            ])
        })

        return bridgeTx
    }

    async getSwapAmountOut(amountIn: bigint, inputToken: any, outputToken: any, publicClient: PublicClient): Promise<bigint> {
        const swapAmountOut = await publicClient.getSwapAmountOut({
            amountIn,
            tokenIn: inputToken.address,
            tokenOut: outputToken.address
        })

        return swapAmountOut
    }
}
