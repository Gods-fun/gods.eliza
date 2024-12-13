import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseUnits } from 'viem';
import { executeSwap } from '../../actions/swap';
import { WalletProvider } from '../../providers/wallet';
import { ContractProvider } from '../../providers/contracts';

// Mock WalletProvider class
vi.mock('../../providers/wallet', () => {
    const mockWalletProvider = vi.fn().mockImplementation((runtime) => ({
        getWalletClient: vi.fn().mockReturnValue({
            getAddresses: vi.fn().mockResolvedValue(['0xmockaddress']),
            writeContract: vi.fn().mockResolvedValue('0xmocktxhash')
        }),
        runtime: runtime,
        getChainConfigs: vi.fn().mockReturnValue({
            ethereum: {
                chainId: 1,
                name: 'Ethereum',
                rpcUrl: 'https://mock.rpc',
                blockExplorerUrl: 'https://mock.explorer',
                nativeCurrency: {
                    name: 'Ethereum',
                    symbol: 'ETH',
                    decimals: 18
                }
            }
        })
    }));

    return {
        WalletProvider: mockWalletProvider,
        getChainConfigs: vi.fn().mockReturnValue({
            ethereum: {
                chainId: 1,
                name: 'Ethereum',
                rpcUrl: 'https://mock.rpc',
                blockExplorerUrl: 'https://mock.explorer',
                nativeCurrency: {
                    name: 'Ethereum',
                    symbol: 'ETH',
                    decimals: 18
                }
            }
        })
    };
});

// Mock ContractProvider
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
            }])
        }))
    }
}));

// Mock LIFI SDK
vi.mock('@lifi/sdk', () => ({
    createConfig: vi.fn(),
    getRoutes: vi.fn().mockResolvedValue({
        routes: [{
            steps: [{
                estimate: {
                    approvalAddress: '0xmockrouter'
                }
            }]
        }]
    }),
    executeRoute: vi.fn().mockResolvedValue({
        steps: [{
            execution: {
                process: [{
                    status: 'DONE',
                    txHash: '0xmocktxhash',
                    data: '0xmockdata'
                }]
            }
        }]
    })
}));

describe('Swap Action', () => {
    const mockRuntime = {
        getSetting: vi.fn((key: string) => {
            if (key === "CHAIN") return { id: 1, name: "Ethereum" };
            if (key === "EVM_PRIVATE_KEY") return "0x1234";
            return undefined;
        }),
        getChainConfigs: vi.fn().mockReturnValue({
            ethereum: {
                chainId: 1,
                name: 'Ethereum',
                rpcUrl: 'https://mock.rpc',
                blockExplorerUrl: 'https://mock.explorer',
                nativeCurrency: {
                    name: 'Ethereum',
                    symbol: 'ETH',
                    decimals: 18
                }
            }
        })
    };

    const mockMessage = {
        content: {
            data: {
                tokenIn: '0xmocktokenin',
                tokenOut: '0xmocktokenout',
                amount: '1000000000000000000', // 1 ETH in wei
                decimals: 18,
                chain: 'ethereum',
                slippage: 0.5
            }
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should successfully execute a swap', async () => {
        const result = await executeSwap.handler(mockRuntime as any, mockMessage as any, {}, mockMessage.content.data);
        expect(result).toBe(true);
    });

    it('should handle errors during swap', async () => {
        // Mock WalletProvider to throw an error
        const mockError = new Error('Swap failed');
        vi.mocked(WalletProvider).mockImplementationOnce(() => {
            throw mockError;
        });

        const result = await executeSwap.handler(mockRuntime as any, mockMessage as any, {}, mockMessage.content.data);
        expect(result).toBe(false);
    });

    it('should validate private key requirement', async () => {
        const mockRuntimeWithKey = {
            getSetting: vi.fn().mockReturnValue('0x1234')
        };
        const result = await executeSwap.validate(mockRuntimeWithKey as any);
        expect(result).toBe(true);
    });

    it('should fail validation without private key', async () => {
        const mockRuntimeWithoutKey = {
            getSetting: vi.fn().mockReturnValue(undefined)
        };
        const result = await executeSwap.validate(mockRuntimeWithoutKey as any);
        expect(result).toBe(false);
    });
});
