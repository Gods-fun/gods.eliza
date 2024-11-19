// plugin-evm/src/utils/swap.ts
import {
    createPublicClient,
    http,
    type Address,
    type Hash,
    parseUnits,
    formatUnits,
    encodeFunctionData
} from 'viem';
import { EVMProvider } from '../providers/evmprovider';
import { TokenRegistry } from '../adapters/tokenRegistry';
import { NetworkRegistry } from '../adapters/networkRegistry';
import { ProtocolConfig } from '../adapters/types';

interface SwapQuoteResult {
    amountIn: bigint;
    amountOut: bigint;
    priceImpact: number;
    route: Address[];
}

const SLIPPAGE_BPS = 50; // 0.5% default slippage

/**
 * @notice Get token decimals from contract
 * @param tokenAddress Token contract address
 * @param chainId Chain ID for the network
 * @returns Number of decimals for the token
 */
export async function getTokenDecimals(
    tokenAddress: Address,
    chainId: number
): Promise<number> {
    const provider = await EVMProvider.getProvider(chainId);

    const decimals = await provider.publicClient.readContract({
        address: tokenAddress,
        abi: [{
            inputs: [],
            name: "decimals",
            outputs: [{ type: "uint8" }],
            stateMutability: "view",
            type: "function"
        }],
        functionName: 'decimals'
    });

    return decimals;
}

/**
 * @notice Get quote for token swap
 * @param params Swap parameters
 * @param protocolConfig DEX protocol configuration
 * @param provider Network provider
 */
export async function getQuote(
    baseToken: Address,
    outputToken: Address,
    amount: string,
    chainId: number
): Promise<SwapQuoteResult> {
    const provider = await EVMProvider.getProvider(chainId);
    const protocolConfig = await provider.getProtocolConfig();

    if (!protocolConfig) {
        throw new Error('Protocol configuration not found');
    }

    const decimals = await getTokenDecimals(baseToken, chainId);
    const amountIn = parseUnits(amount, decimals);
    const path = [baseToken, outputToken];

    if (protocolConfig.version === 'v3') {
        // UniswapV3 quoter logic
        const quoterResult = await provider.publicClient.readContract({
            address: protocolConfig.quoterAddress!,
            abi: [{
                inputs: [{
                    name: 'params',
                    type: 'tuple',
                    components: [
                        { name: 'tokenIn', type: 'address' },
                        { name: 'tokenOut', type: 'address' },
                        { name: 'amountIn', type: 'uint256' },
                        { name: 'fee', type: 'uint24' }
                    ]
                }],
                name: 'quoteExactInputSingle',
                outputs: [
                    { name: 'amountOut', type: 'uint256' },
                    { name: 'sqrtPriceX96After', type: 'uint160' },
                    { name: 'initializedTicksCrossed', type: 'uint32' },
                    { name: 'gasEstimate', type: 'uint256' }
                ],
                stateMutability: 'nonpayable',
                type: 'function'
            }],
            functionName: 'quoteExactInputSingle',
            args: [{
                tokenIn: baseToken,
                tokenOut: outputToken,
                amountIn,
                fee: protocolConfig.defaultFeeBps * 100 // Convert bps to protocol fee format
            }]
        });

        return {
            amountIn,
            amountOut: quoterResult[0],
            priceImpact: calculatePriceImpact(amountIn, quoterResult[0]),
            route: path
        };
    } else {
        // UniswapV2 getAmountsOut logic
        const amountsOut = await provider.publicClient.readContract({
            address: protocolConfig.routerAddress,
            abi: [{
                inputs: [
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'path', type: 'address[]' }
                ],
                name: 'getAmountsOut',
                outputs: [{ name: 'amounts', type: 'uint256[]' }],
                stateMutability: 'view',
                type: 'function'
            }],
            functionName: 'getAmountsOut',
            args: [amountIn, path]
        });

        return {
            amountIn,
            amountOut: amountsOut[1],
            priceImpact: calculatePriceImpact(amountIn, amountsOut[1]),
            route: path
        };
    }
}

/**
 * @notice Calculate price impact for a swap
 * @param amountIn Input amount in wei
 * @param amountOut Output amount in wei
 * @returns Price impact as a percentage
 */
function calculatePriceImpact(amountIn: bigint, amountOut: bigint): number {
    // Simplified price impact calculation
    // In a real implementation, you'd compare to the current market price
    const impact = (Number(amountIn) - Number(amountOut)) / Number(amountIn) * 100;
    return Math.abs(impact);
}

/**
 * @notice Execute a swap transaction
 * @param txHash Transaction hash to monitor
 * @param chainId Network chain ID
 * @returns Transaction hash
 */
export async function executeSwap(
    txHash: Hash,
    chainId: number
): Promise<Hash> {
    const provider = await EVMProvider.getProvider(chainId);
    const network = await NetworkAdapter.getInstance().getNetwork(chainId);

    if (!network) {
        throw new Error('Network not found');
    }

    try {
        const receipt = await provider.publicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 2
        });

        if (receipt.status !== 'success') {
            throw new Error(`Transaction failed: ${receipt.status}`);
        }

        console.log(`Swap successful: ${network.blockExplorerUrl}/tx/${txHash}`);
        return txHash;
    } catch (error) {
        console.error('Error executing swap:', error);
        throw error;
    }
}

/**
 * @notice Prepare swap transaction data
 * @param params Swap parameters
 * @param walletAddress Wallet address executing the swap
 * @returns Transaction parameters
 */
export async function prepareSwapTransaction(
    inputToken: Address,
    outputToken: Address,
    amount: string,
    walletAddress: Address,
    chainId: number
): Promise<{
    to: Address;
    data: `0x${string}`;
    value?: bigint;
}> {
    const provider = await EVMProvider.getProvider(chainId);
    const protocolConfig = await provider.getProtocolConfig();
    const network = await NetworkAdapter.getInstance().getNetwork(chainId);

    if (!protocolConfig || !network) {
        throw new Error('Protocol or network configuration not found');
    }

    const tokenAdapter = TokenAdapter.getInstance();
    const nativeToken = network.nativeCurrency;

    const isNativeToken = inputToken.toLowerCase() === nativeToken.address?.toLowerCase();
    const decimals = isNativeToken ? nativeToken.decimals : await getTokenDecimals(inputToken, chainId);

    // Get quote and calculate minimum amount out
    const quote = await getQuote(inputToken, outputToken, amount, chainId);
    const amountOutMin = quote.amountOut * BigInt(10000 - SLIPPAGE_BPS) / BigInt(10000);

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 minutes
    const path = [inputToken, outputToken];

    let functionName: string;
    let args: any[];

    if (protocolConfig.version === 'v3') {
        // UniswapV3 swap parameters
        functionName = isNativeToken ? 'exactInputSingleETH' : 'exactInputSingle';
        args = [{
            tokenIn: inputToken,
            tokenOut: outputToken,
            fee: protocolConfig.defaultFeeBps * 100,
            recipient: walletAddress,
            amountIn: quote.amountIn,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: 0
        }];
    } else {
        // UniswapV2 swap parameters
        if (isNativeToken) {
            functionName = 'swapExactETHForTokens';
            args = [amountOutMin, path, walletAddress, deadline];
        } else {
            functionName = outputToken.toLowerCase() === nativeToken.address?.toLowerCase() ?
                'swapExactTokensForETH' :
                'swapExactTokensForTokens';
            args = [quote.amountIn, amountOutMin, path, walletAddress, deadline];
        }
    }

    const data = encodeFunctionData({
        abi: protocolConfig.version === 'v3' ?
            await getUniswapV3RouterABI() :
            await getUniswapV2RouterABI(),
        functionName,
        args
    });

    return {
        to: protocolConfig.routerAddress,
        data,
        ...(isNativeToken && { value: quote.amountIn })
    };
}

// You would need to implement these functions to get the appropriate ABIs
async function getUniswapV3RouterABI() {
    // Return Uniswap V3 Router ABI
    return [];
}

async function getUniswapV2RouterABI() {
    // Return Uniswap V2 Router ABI
    return [];
}
