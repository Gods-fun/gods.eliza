// plugin-evm/src/actions/swap/__tests__/swap.test.ts
import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import {
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
    Content
} from "@ai16z/eliza";
import { TokenAdapter, NetworkAdapter } from '../../../adapters';
import { EVMProvider } from '../../../providers/evmprovider';
import swapAction from '../index';

// Mock dependencies
jest.mock('@ai16z/eliza', () => ({
    ...jest.requireActual('@ai16z/eliza'),
    generateText: jest.fn(),
    composeContext: jest.fn()
}));

jest.mock('../../../adapters/TokenAdapter');
jest.mock('../../../adapters/NetworkAdapter');
jest.mock('../../../providers/evmprovider');

describe('Swap Action', () => {
    let mockRuntime: IAgentRuntime;
    let mockMessage: Memory;
    let mockState: State;
    let mockCallback: HandlerCallback;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Setup mock data
        mockRuntime = {
            agentAddress: '0x123' as `0x${string}`,
            composeState: jest.fn(),
        } as unknown as IAgentRuntime;

        mockMessage = {
            content: {
                text: 'swap 1 ETH for USDC on mainnet',
                source: 'discord'
            }
        } as Memory;

        mockState = {} as State;

        mockCallback = jest.fn();

        // Setup TokenAdapter mock
        (TokenAdapter.getInstance as jest.Mock).mockReturnValue({
            getToken: jest.fn().mockResolvedValue({
                symbol: 'ETH',
                address: '0x123',
                decimals: 18
            })
        });

        // Setup NetworkAdapter mock
        (NetworkAdapter.getInstance as jest.Mock).mockReturnValue({
            getNetworks: jest.fn().mockResolvedValue([
                {
                    chainId: 1,
                    name: 'mainnet',
                    enabled: true
                }
            ]),
            getNetwork: jest.fn().mockResolvedValue({
                chainId: 1,
                name: 'mainnet',
                enabled: true
            })
        });

        // Setup EVMProvider mock
        (EVMProvider.getProvider as jest.Mock).mockResolvedValue({
            getProtocolConfig: jest.fn().mockResolvedValue({
                version: 'v3',
                defaultFeeBps: 30
            })
        });
    });

    describe('validate', () => {
        it('should return false for non-discord messages', async () => {
            const nonDiscordMessage = {
                content: {
                    text: 'swap 1 ETH for USDC',
                    source: 'telegram'
                }
            } as Memory;

            const result = await swapAction.validate(mockRuntime, nonDiscordMessage, mockState);
            expect(result).toBe(false);
        });

        it('should return true for valid swap messages', async () => {
            const result = await swapAction.validate(mockRuntime, mockMessage, mockState);
            expect(result).toBe(true);
        });

        it('should return false for messages without token symbols', async () => {
            const invalidMessage = {
                content: {
                    text: 'swap some tokens',
                    source: 'discord'
                }
            } as Memory;

            const result = await swapAction.validate(mockRuntime, invalidMessage, mockState);
            expect(result).toBe(false);
        });
    });

    describe('handler', () => {
        it('should handle valid swap requests', async () => {
            const response = await swapAction.handler(
                mockRuntime,
                mockMessage,
                mockState,
                {},
                mockCallback
            );

            expect(response).toBeDefined();
            expect(response.action).toBe('SWAP_TOKEN_QUOTE');
            expect(mockCallback).toHaveBeenCalled();
        });

        it('should handle errors gracefully', async () => {
            // Make TokenAdapter throw an error
            (TokenAdapter.getInstance as jest.Mock).mockReturnValue({
                getToken: jest.fn().mockRejectedValue(new Error('Token not found'))
            });

            const response = await swapAction.handler(
                mockRuntime,
                mockMessage,
                mockState,
                {},
                mockCallback
            );

            expect(response.text).toContain('Error');
            expect(mockCallback).toHaveBeenCalled();
        });

        it('should handle unsupported networks', async () => {
            const unsupportedMessage = {
                content: {
                    text: 'swap 1 ETH for USDC on unknown-network',
                    source: 'discord'
                }
            } as Memory;

            const response = await swapAction.handler(
                mockRuntime,
                unsupportedMessage,
                mockState,
                {},
                mockCallback
            );

            expect(response.text).toContain('Error');
            expect(mockCallback).toHaveBeenCalled();
        });
    });
});

// plugin-evm/src/utils/__tests__/swap.test.ts
import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { parseUnits } from 'viem';
import {
    getQuote,
    executeSwap,
    prepareSwapTransaction,
    getTokenDecimals
} from '../swap';
import { EVMProvider } from '../../providers/evmprovider';
import { TokenAdapter, NetworkAdapter } from '../../adapters';

jest.mock('viem');
jest.mock('../../providers/evmprovider');
jest.mock('../../adapters/TokenAdapter');
jest.mock('../../adapters/NetworkAdapter');

describe('Swap Utils', () => {
    const mockBaseToken = '0x123' as `0x${string}`;
    const mockOutputToken = '0x456' as `0x${string}`;
    const mockChainId = 1;
    const mockWalletAddress = '0x789' as `0x${string}`;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup EVMProvider mock
        (EVMProvider.getProvider as jest.Mock).mockResolvedValue({
            publicClient: {
                readContract: jest.fn().mockResolvedValue([parseUnits('1', 18), parseUnits('2000', 6)]),
                waitForTransactionReceipt: jest.fn().mockResolvedValue({ status: 'success' })
            },
            getProtocolConfig: jest.fn().mockResolvedValue({
                version: 'v3',
                routerAddress: '0xabc',
                quoterAddress: '0xdef',
                defaultFeeBps: 30
            })
        });

        // Setup NetworkAdapter mock
        (NetworkAdapter.getInstance as jest.Mock).mockReturnValue({
            getNetwork: jest.fn().mockResolvedValue({
                chainId: 1,
                name: 'mainnet',
                enabled: true,
                nativeCurrency: {
                    symbol: 'ETH',
                    decimals: 18,
                    address: '0x123'
                }
            })
        });
    });

    describe('getTokenDecimals', () => {
        it('should return correct decimals for a token', async () => {
            const mockDecimals = 18;
            const provider = await EVMProvider.getProvider(mockChainId);
            (provider.publicClient.readContract as jest.Mock).mockResolvedValueOnce(mockDecimals);

            const decimals = await getTokenDecimals(mockBaseToken, mockChainId);
            expect(decimals).toBe(mockDecimals);
        });

        it('should handle errors when getting decimals', async () => {
            const provider = await EVMProvider.getProvider(mockChainId);
            (provider.publicClient.readContract as jest.Mock).mockRejectedValueOnce(new Error('Contract error'));

            await expect(getTokenDecimals(mockBaseToken, mockChainId)).rejects.toThrow();
        });
    });

    describe('getQuote', () => {
        it('should return quote for V3 protocol', async () => {
            const quote = await getQuote(mockBaseToken, mockOutputToken, '1', mockChainId);

            expect(quote).toBeDefined();
            expect(quote.amountIn).toBeDefined();
            expect(quote.amountOut).toBeDefined();
            expect(quote.priceImpact).toBeDefined();
            expect(quote.route).toEqual([mockBaseToken, mockOutputToken]);
        });

        it('should handle V2 protocol quotes', async () => {
            const provider = await EVMProvider.getProvider(mockChainId);
            (provider.getProtocolConfig as jest.Mock).mockResolvedValueOnce({
                version: 'v2',
                routerAddress: '0xabc',
                defaultFeeBps: 30
            });

            const quote = await getQuote(mockBaseToken, mockOutputToken, '1', mockChainId);
            expect(quote).toBeDefined();
        });
    });

    describe('executeSwap', () => {
        it('should execute swap successfully', async () => {
            const mockTxHash = '0xabc' as `0x${string}`;
            const result = await executeSwap(mockTxHash, mockChainId);
            expect(result).toBe(mockTxHash);
        });

        it('should handle failed transactions', async () => {
            const mockTxHash = '0xabc' as `0x${string}`;
            const provider = await EVMProvider.getProvider(mockChainId);
            (provider.publicClient.waitForTransactionReceipt as jest.Mock)
                .mockResolvedValueOnce({ status: 'failed' });

            await expect(executeSwap(mockTxHash, mockChainId)).rejects.toThrow();
        });
    });

    describe('prepareSwapTransaction', () => {
        it('should prepare transaction for ETH input', async () => {
            const tx = await prepareSwapTransaction(
                mockBaseToken,
                mockOutputToken,
                '1',
                mockWalletAddress,
                mockChainId
            );

            expect(tx.to).toBeDefined();
            expect(tx.data).toBeDefined();
            expect(tx.value).toBeDefined();
        });

        it('should prepare transaction for token input', async () => {
            const tokenInputTx = await prepareSwapTransaction(
                mockOutputToken, // Using as input token
                mockBaseToken,
                '1',
                mockWalletAddress,
                mockChainId
            );

            expect(tokenInputTx.to).toBeDefined();
            expect(tokenInputTx.data).toBeDefined();
            expect(tokenInputTx.value).toBeUndefined();
        });
    });
});
