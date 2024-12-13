import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContractProvider } from '../../providers/contractProvider';
import { WalletProvider } from '../../providers/wallet';
import { callContractAction } from '../../actions/contractActions';
import { ContractEvaluator } from '../../evaluators/contractEvaluator';
import { IAgentRuntime, Memory } from '@ai16z/eliza/src/types';

describe('Contract Flow Integration', () => {
    let mockRuntime: IAgentRuntime;
    let mockContractProvider: ContractProvider;
    let mockWalletProvider: WalletProvider;
    let evaluator: ContractEvaluator;

    beforeEach(async () => {
        // Create mock contract
        const mockContract = {
            transfer: vi.fn().mockImplementation((...args) => {
                return Promise.resolve({ hash: '0x123' });
            }),
            estimateGas: {
                transfer: vi.fn().mockResolvedValue('50000'),
            },
            balanceOf: vi.fn().mockResolvedValue(BigInt('1000000000000000000')), // 1 ETH
        };

        // Mock contract provider
        mockContractProvider = {
            registry: {
                addContract: vi.fn().mockImplementation(async (contract) => {
                    mockContractProvider.registry.contracts.set(contract.name, contract);
                }),
                getContract: vi.fn().mockImplementation((name) => {
                    return mockContractProvider.registry.contracts.get(name);
                }),
                contracts: new Map(),
            },
            getContract: vi.fn().mockImplementation((name) => {
                if (name === 'TestToken') {
                    return Promise.resolve(mockContract);
                }
                throw new Error(`Contract ${name} not found`);
            }),
        } as unknown as ContractProvider;

        // Mock wallet provider
        mockWalletProvider = {
            getWalletClient: vi.fn().mockReturnValue({
                getAddresses: vi.fn().mockResolvedValue(['0xmockaddress']),
                writeContract: vi.fn().mockResolvedValue('0xmocktxhash')
            }),
        } as unknown as WalletProvider;

        // Set up mock runtime
        mockRuntime = {
            getProvider: vi.fn().mockImplementation((provider) => {
                if (provider === ContractProvider) return mockContractProvider;
                if (provider === WalletProvider) return mockWalletProvider;
                return null;
            }),
            getSetting: vi.fn().mockReturnValue('0x1234'),
        } as unknown as IAgentRuntime;

        // Initialize evaluator
        evaluator = new ContractEvaluator();

        // Add test token contract to registry
        await mockContractProvider.registry.addContract({
            name: 'TestToken',
            address: '0x1234567890abcdef1234567890abcdef12345678',
            chainId: 1,
            abi: [
                "function transfer(address recipient, uint256 amount) public returns (bool)",
                "function balanceOf(address account) public view returns (uint256)"
            ],
        });
    });

    it('should execute complete contract interaction flow', async () => {
        // 1. First validate the contract call
        const validationResult = await evaluator.evaluateContractCall(
            mockRuntime,
            'TestToken',
            'transfer',
            ['0xrecipient', '1000000']
        );

        expect(validationResult.isValid).toBe(true);
        expect(validationResult.estimatedGas).toBe('50000');
        expect(validationResult.risks).toHaveLength(0);

        // 2. Then execute the contract call
        const message: Memory = {
            agentId: undefined,
            roomId: undefined,
            userId: undefined,
            content: {
                text: 'contractName: TestToken method: transfer params: ["0xrecipient", "1000000"]'
            }
        };

        const callback = vi.fn();
        const result = await callContractAction.handler(mockRuntime, message, {}, {}, callback);

        expect(result).toBe(true);
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
            type: 'CONTRACT_CALL_SUCCESS',
            data: expect.objectContaining({
                transactionHash: '0x123',
                contractName: 'TestToken',
                method: 'transfer',
            }),
        }));
    });

    it('should handle contract call failure gracefully', async () => {
        // Mock a contract error
        mockContractProvider.getContract = vi.fn().mockImplementation(() => {
            throw new Error('Contract call failed');
        });

        const message: Memory = {
            agentId: undefined,
            roomId: undefined,
            userId: undefined,
            content: {
                text: 'contractName: TestToken method: transfer params: ["0xrecipient", "1000000"]'
            }
        };

        const callback = vi.fn();
        const result = await callContractAction.handler(mockRuntime, message, {}, {}, callback);

        expect(result).toBe(false);
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
            type: 'CONTRACT_CALL_ERROR',
            data: expect.objectContaining({
                error: 'Contract call failed',
            }),
        }));
    });

    it('should validate and execute contract call with value', async () => {
        const message: Memory = {
            agentId: undefined,
            roomId: undefined,
            userId: undefined,
            content: {
                text: 'contractName: TestToken method: transfer params: ["0xrecipient", "1000000"] value: "1000"'
            }
        };

        // First validate
        const validationResult = await evaluator.evaluateContractCall(
            mockRuntime,
            'TestToken',
            'transfer',
            ['0xrecipient', '1000000']
        );

        expect(validationResult.isValid).toBe(true);

        // Then execute
        const callback = vi.fn();
        const result = await callContractAction.handler(mockRuntime, message, {}, {}, callback);

        expect(result).toBe(true);
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
            type: 'CONTRACT_CALL_SUCCESS',
            data: expect.objectContaining({
                transactionHash: '0x123',
            }),
        }));
    });

    it('should handle invalid contract parameters', async () => {
        // Override the mock contract implementation for this test
        const mockErrorContract = {
            transfer: vi.fn().mockImplementation((...args) => {
                if (args[0] === 'invalid_address') {
                    throw new Error('Invalid address parameter');
                }
                return Promise.resolve({ hash: '0x123' });
            }),
            estimateGas: {
                transfer: vi.fn().mockResolvedValue('50000'),
            },
        };

        // Update the contract provider to return our error-throwing contract
        mockContractProvider.getContract = vi.fn().mockImplementation((name) => {
            if (name === 'TestToken') {
                return Promise.resolve(mockErrorContract);
            }
            throw new Error(`Contract ${name} not found`);
        });

        const message: Memory = {
            agentId: undefined,
            roomId: undefined,
            userId: undefined,
            content: {
                text: 'contractName: TestToken method: transfer params: ["invalid_address"]' // Invalid parameter
            }
        };

        const callback = vi.fn();
        const result = await callContractAction.handler(mockRuntime, message, {}, {}, callback);

        expect(result).toBe(false);
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
            type: 'CONTRACT_CALL_ERROR',
            data: expect.objectContaining({
                error: 'Invalid address parameter',
                contractName: 'TestToken',
                method: 'transfer',
                params: ['invalid_address'],
            }),
        }));
    });
});
