import {
    createPublicClient,
    http,
    type Address,
    type Hash,
    parseUnits,
    formatUnits
} from 'viem';
import settings from "@ai16z/eliza/src/settings.ts";

export async function getTokenDecimals(
    tokenAddress: Address
): Promise<number> {
    const client = createPublicClient({
        chain: settings.chainConfig.chain,
        transport: http(settings.chainConfig.rpcUrl)
    });

    const decimals = await client.readContract({
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

export async function getQuote(
    baseToken: Address,
    outputToken: Address,
    amount: string,
    decimals: number
): Promise<string> {
    const client = createPublicClient({
        chain: settings.chainConfig.chain,
        transport: http(settings.chainConfig.rpcUrl)
    });

    const router = {
        address: settings.chainConfig.dex.routerAddress as Address,
        abi: settings.chainConfig.dex.routerAbi
    };

    const amountIn = parseUnits(amount, decimals);
    const path = [baseToken, outputToken];

    const amounts = await client.readContract({
        ...router,
        functionName: 'getAmountsOut',
        args: [amountIn, path]
    });

    return formatUnits(amounts[1], decimals);
}

const SLIPPAGE = 0.5; // 0.5% slippage

export async function executeSwap(
    txHash: Hash,
    type: "buy" | "sell"
): Promise<Hash> {
    const client = createPublicClient({
        chain: settings.chainConfig.chain,
        transport: http(settings.chainConfig.rpcUrl)
    });

    try {
        const receipt = await client.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 2 // Wait for 2 confirmations
        });

        if (receipt.status !== 'success') {
            throw new Error(`Transaction failed: ${receipt.status}`);
        }

        console.log(`${type === 'buy' ? 'Buy' : 'Sell'} successful: ${settings.chainConfig.blockExplorer}/tx/${txHash}`);
        return txHash;
    } catch (error) {
        console.error('Error executing swap:', error);
        throw error;
    }
}

export async function getSwapTransaction(
    inputToken: Address,
    outputToken: Address,
    amount: string,
    walletAddress: Address,
    type: "buy" | "sell"
): Promise<{
    to: Address;
    data: `0x${string}`;
    value?: bigint;
}> {
    const isNativeToken = inputToken.toLowerCase() === settings.chainConfig.nativeCurrency.address.toLowerCase();
    const decimals = isNativeToken ? 18 : await getTokenDecimals(inputToken);
    const amountIn = parseUnits(amount, decimals);
    const path = [inputToken, outputToken];
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 minutes

    // Calculate minimum amount out
    const quote = await getQuote(inputToken, outputToken, amount, decimals);
    const amountOutMin = parseUnits(
        (Number(quote) * (1 - SLIPPAGE / 100)).toFixed(decimals),
        decimals
    );

    const functionData = isNativeToken ?
        // swapExactETHForTokens
        encodeFunctionData({
            abi: settings.chainConfig.dex.routerAbi,
            functionName: 'swapExactETHForTokens',
            args: [amountOutMin, path, walletAddress, deadline]
        }) :
        // swapExactTokensForTokens/ETH
        encodeFunctionData({
            abi: settings.chainConfig.dex.routerAbi,
            functionName: outputToken.toLowerCase() === settings.chainConfig.nativeCurrency.address.toLowerCase() ?
                'swapExactTokensForETH' :
                'swapExactTokensForTokens',
            args: [amountIn, amountOutMin, path, walletAddress, deadline]
        });

    return {
        to: settings.chainConfig.dex.routerAddress,
        data: functionData,
        ...(isNativeToken && { value: amountIn })
    };
}
