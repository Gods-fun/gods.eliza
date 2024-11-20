import type { Route, RoutesRequest, TransactionRequest as LiFiTransactionRequest } from '@lifi/types'
import type { WalletProvider } from '../providers/wallet'
import type { Transaction, SwapParams } from '../types'
import { ByteArray, type Hex } from 'viem'
import { TokenRegistry } from '../adapters/tokenRegistry'
import { NetworkRegistry } from '../adapters/networkRegistry'
import UniswapV2RouterABI from '../abis/UniswapV2RouterABI.json'
import UniswapV3RouterABI from '../abis/UniswapV3RouterABI.json'

export const swapTemplate = `Given the recent messages and wallet information below:

{{recentMessages}}

{{walletInfo}}

Extract the following information about the requested token swap:
- Input token symbol or address (the token being sold)
- Output token symbol or address (the token being bought)
- Amount to swap
- Chain to execute on (ethereum or base)
- Slippage tolerance (optional)
- Swap protocol (LiFi or Uniswap)

Respond with a JSON markdown block containing only the extracted values:

\`\`\`json
{
    "inputToken": string | null,
    "outputToken": string | null,
    "amount": string | null,
    "chain": "ethereum" | "base" | null,
    "slippage": number | null,
    "protocol": "LiFi" | "Uniswap" | null
}
\`\`\`
`

export class SwapAction {
    private tokenRegistry: TokenRegistry
    private networkRegistry: NetworkRegistry

    constructor(
        private walletProvider: WalletProvider,
        tokenRegistry: TokenRegistry,
        networkRegistry: NetworkRegistry
    ) {
        this.tokenRegistry = tokenRegistry
        this.networkRegistry = networkRegistry
    }

    async swap(params: SwapParams): Promise<Transaction> {
        const walletClient = this.walletProvider.getWalletClient()
        const [fromAddress] = await walletClient.getAddresses()

        await this.walletProvider.switchChain(params.chain)

        const inputToken = await this.tokenRegistry.getToken(params.inputToken, params.chain)
        const outputToken = await this.tokenRegistry.getToken(params.outputToken, params.chain)
        const network = await this.networkRegistry.getNetwork(params.chain)

        if (!inputToken || !outputToken || !network) {
            throw new Error('Invalid token or network')
        }

        if (params.protocol === 'LiFi') {
            const routeRequest: RoutesRequest = {
                fromChainId: network.chainId,
                toChainId: network.chainId,
                fromTokenAddress: inputToken.address,
                toTokenAddress: outputToken.address,
                fromAmount: params.amount,
                fromAddress: fromAddress,
                options: {
                    slippage: params.slippage || 0.5,
                    order: 'RECOMMENDED'
                }
            }

            const response = await fetch('https://li.quest/v1/routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(routeRequest)
            })

            const { routes } = await response.json()
            if (!routes.length) throw new Error('No routes found')

            const route = routes[0] as Route
            const lifiTxRequest = route.steps[0].transactionRequest as LiFiTransactionRequest

            try {
                const hash = await walletClient.sendTransaction({
                    account: fromAddress,
                    to: lifiTxRequest.to as Hex,
                    data: lifiTxRequest.data as Hex,
                    value: BigInt(lifiTxRequest.value || 0),
                    kzg: {
                        blobToKzgCommitment: function (blob: ByteArray): ByteArray {
                            throw new Error('Function not implemented.')
                        },
                        computeBlobKzgProof: function (blob: ByteArray, commitment: ByteArray): ByteArray {
                            throw new Error('Function not implemented.')
                        }
                    },
                    chain: undefined
                })

                return {
                    hash,
                    from: fromAddress,
                    to: lifiTxRequest.to as Hex,
                    value: BigInt(params.amount),
                    data: lifiTxRequest.data as Hex
                }
            } catch (error) {
                throw new Error(`Swap failed: ${error.message}`)
            }
        } else if (params.protocol === 'Uniswap') {
            const uniswapRouterAddress = network.uniswapRouterAddress
            const uniswapRouterABI = network.uniswapRouterABI === 'v2' ? UniswapV2RouterABI : UniswapV3RouterABI

            const swapTx = await walletClient.sendTransaction({
                from: fromAddress,
                to: uniswapRouterAddress,
                value: 0,
                data: encodeFunctionData(uniswapRouterABI, 'swapExactTokensForTokens', [
                    params.amount,
                    0,
                    [inputToken.address, outputToken.address],
                    fromAddress,
                    Math.floor(Date.now() / 1000) + 60 * 20
                ])
            })

            return {
                hash: swapTx.hash,
                from: fromAddress,
                to: uniswapRouterAddress,
                value: 0,
                data: swapTx.data
            }
        } else {
            throw new Error('Invalid protocol')
        }
    }
}
