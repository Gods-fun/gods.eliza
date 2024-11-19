import { createPublicClient, formatUnits, http, Address } from 'viem';
import settings from '@ai16z/eliza/src/settings.ts';

const ERC20_ABI = [
    {
        inputs: [{ name: "account", type: "address" }],
        name: "balanceOf",
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "decimals",
        outputs: [{ type: "uint8" }],
        stateMutability: "view",
        type: "function",
    }
] as const;

export async function getTokenPriceInEth(tokenAddress: Address): Promise<number> {
    const client = createPublicClient({
        chain: settings.chainConfig.chain,
        transport: http(settings.chainConfig.rpcUrl)
    });

    // Get price from DEX router (example using Uniswap V2)
    const routerContract = {
        address: settings.chainConfig.dex.routerAddress as Address,
        abi: settings.chainConfig.dex.routerAbi
    };

    try {
        const amountIn = BigInt(1e18); // 1 token
        const path = [tokenAddress, settings.chainConfig.dex.wethAddress as Address];

        const amounts = await client.readContract({
            ...routerContract,
            functionName: 'getAmountsOut',
            args: [amountIn, path]
        });

        return Number(formatUnits(amounts[1], 18));
    } catch (error) {
        console.error('Error getting token price:', error);
        return 0;
    }
}

export async function getTokenBalance(
    walletAddress: Address,
    tokenAddress: Address
): Promise<number> {
    const client = createPublicClient({
        chain: settings.chainConfig.chain,
        transport: http(settings.chainConfig.rpcUrl)
    });

    try {
        const [balance, decimals] = await Promise.all([
            client.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [walletAddress]
            }),
            client.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'decimals'
            })
        ]);

        return Number(formatUnits(balance, decimals));
    } catch (error) {
        console.error(`Error retrieving balance for token: ${tokenAddress}`, error);
        return 0;
    }
}

export async function getTokenBalances(
    walletAddress: Address
): Promise<{ [tokenName: string]: number }> {
    const tokenBalances: { [tokenName: string]: number } = {};
    const tokenList = settings.chainConfig.tokens;

    for (const token of tokenList) {
        const tokenName = getTokenName(token.address);
        const balance = await getTokenBalance(walletAddress, token.address);
        tokenBalances[tokenName] = balance;
    }

    return tokenBalances;
}

export function getTokenName(tokenAddress: Address): string {
    const token = settings.chainConfig.tokens.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
    return token?.symbol || 'Unknown Token';
}
