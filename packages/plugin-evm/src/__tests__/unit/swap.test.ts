import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseUnits } from 'viem';
import { executeSwap } from '../../actions/swap';
import { WalletProvider } from '../../providers/wallet';
import { ContractProvider } from '../../providers/contracts';

// Mock providers
vi.mock('../../providers/wallet', () => ({
    WalletProvider: {
        getInstance: vi.fn(() => ({
            initialize: vi.fn(),
            getPublicClient: vi.fn(() => ({
                readContract: vi.fn().mockResolvedValue([BigInt(1000000), BigInt(990000)]),
                waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success' })
            })),
            getWalletClient: vi.fn(() => ({
                writeContract: vi.fn().mockResolvedValue('0xmocktxhash')
            })),
            getAddress: vi.fn().mockResolvedValue('0xmockaddress')
        }))
    }
}));

vi.mock('../../providers/contracts', () => ({
    ContractProvider: {
        getInstance: vi.fn(() => ({
            getRouterAddress: vi.fn().mockReturnValue('0xmockrouter'),
            getRouterAbi: vi.fn().mockReturnValue([{
                inputs: [
                    { name: "amountIn", type: "uint256" },
                    { name: "amountOutMin", type: "uint256" },
                    { name: "path", type: "address[]" },
                    { name: "to", type: "address" },
                    { name: "deadline", type: "uint256" }
                ],
                name: "swapExactTokensForTokens",
                outputs: [{ name: "amounts", type: "uint256[]" }],
                stateMutability: "nonpayable",
                type: "function"
            }]),
            getErc20Abi: vi.fn().mockReturnValue([{
                inputs: [
                    { name: "spender", type: "address" },
                    { name: "amount", type: "uint256" }
                ],
                name: "approve",
                outputs: [{ name: "success", type: "bool" }],
                stateMutability: "nonpayable",
                type: "function"
            }])
        }))
    }
}));

describe('Swap Action', () => {
    const mockRuntime = {
        getSetting: vi.fn((key: string) => {
            if (key === "CHAIN") return { id: 1, name: "Ethereum" };
            return undefined;
        })
    };

    const mockMessage = {
        tokenIn: '0xmocktokenin',
        tokenOut: '0xmocktokenout',
        amount: '1.0',
        decimals: 18
    };

    const mockState = {};

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should successfully execute a swap', async () => {
        const result = await executeSwap.handler(mockRuntime as any, mockMessage as any, mockState as any);
        
        expect(result).toBe(true);
        
        // Verify wallet initialization
        expect(WalletProvider.getInstance().initialize).toHaveBeenCalledWith({ id: 1, name: "Ethereum" });
        
        // Verify wallet address was requested
        expect(WalletProvider.getInstance().getAddress).toHaveBeenCalled();
        
        // Verify contract interactions
        const walletClient = WalletProvider.getInstance().getWalletClient();
        expect(walletClient.writeContract).toHaveBeenCalledTimes(2); // Once for approve, once for swap
        
        // Verify approval transaction
        expect(walletClient.writeContract).toHaveBeenCalledWith(expect.objectContaining({
            address: '0xmocktokenin',
            functionName: 'approve'
        }));
        
        // Verify swap transaction
        expect(walletClient.writeContract).toHaveBeenCalledWith(expect.objectContaining({
            address: '0xmockrouter',
            functionName: 'swapExactTokensForTokens'
        }));
    });

    it('should handle errors during swap', async () => {
        // Mock a failure in the wallet client
        vi.mocked(WalletProvider.getInstance().getWalletClient).mockImplementationOnce(() => ({
            writeContract: vi.fn().mockRejectedValue(new Error('Swap failed'))
        }));

        const result = await executeSwap.handler(mockRuntime as any, mockMessage as any, mockState as any);
        
        expect(result).toBe(false);
    });

    it('should handle invalid input parameters', async () => {
        const invalidMessage = {
            ...mockMessage,
            amount: 'invalid'
        };

        const result = await executeSwap.handler(mockRuntime as any, invalidMessage as any, mockState as any);
        
        expect(result).toBe(false);
    });

    it('should calculate correct slippage', async () => {
        const publicClient = WalletProvider.getInstance().getPublicClient();
        
        // Mock getAmountsOut to return specific values
        vi.mocked(publicClient.readContract).mockResolvedValueOnce([
            BigInt(1000000), // amountIn
            BigInt(2000000)  // amountOut
        ]);

        await executeSwap.handler(mockRuntime as any, mockMessage as any, mockState as any);

        // Verify the swap was called with correct slippage (0.5%)
        const walletClient = WalletProvider.getInstance().getWalletClient();
        const lastCall = vi.mocked(walletClient.writeContract).mock.lastCall?.[0];
        
        expect(lastCall?.args?.[1]).toBe(BigInt(1990000)); // 2000000 * 0.995
    });
});
