import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContractProvider } from '../../providers/contractProvider';
import { callContractAction } from '../../actions/contractActions';
import { IAgentRuntime, Memory } from '@ai16z/eliza/src/types';
import { IContractCall } from '../../types/contracts';

describe('Contract Actions', () => {
    let mockRuntime: IAgentRuntime;
    let mockContractProvider: ContractProvider;

    beforeEach(() => {
        mockContractProvider = {
            registry: {
                addContract: vi.fn().mockResolvedValue(undefined),
                getContract: vi.fn().mockImplementation((contractName) => {
                    // Mocking the contract retrieval
                    if (contractName === 'ExampleToken') {
                        return {
                            transfer: vi.fn().mockResolvedValue({ hash: '0x123' }),
                        };
                    }
                    throw new Error(`Contract ${contractName} not found`);
                }),
            },
            getContract: vi.fn().mockImplementation((contractName) => {
                // Mocking the contract retrieval
                if (contractName === 'ExampleToken') {
                    return {
                        transfer: vi.fn().mockResolvedValue({ hash: '0x123' }),
                    };
                }
                throw new Error(`Contract ${contractName} not found`);
            }),
        } as unknown as ContractProvider;

        mockRuntime = {
            // Add properties from core IAgentRuntime as needed
        } as IAgentRuntime;

        // Add getProvider method to mockRuntime
        (mockRuntime as any).getProvider = vi.fn().mockReturnValue(mockContractProvider);
    });

    describe('callContractAction', () => {
        it('should validate correct contract call', async () => {
            const message: Memory = {
                agentId: undefined, roomId: undefined, userId: undefined,
                content: {
                    text: 'contractName: ExampleToken method: transfer params: ["user2", "100"]',
                }
            };

            const result = await callContractAction.validate(mockRuntime, message);
            expect(result).toBe(true);
        });

        it('should log an error for malformed JSON params', async () => {
            const message: Memory = {
                agentId: undefined, roomId: undefined, userId: undefined,
                content: {
                    text: 'contractName: ExampleToken method: transfer params: invalid params', // Should be a JSON array string
                },
            };

            const consoleErrorSpy = vi.spyOn(console, 'error');

            const result = await callContractAction.validate(mockRuntime, message);
            expect(result).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to parse JSON", expect.any(Error));
        });

        it('should log an error for missing method', async () => {
            const message: Memory = {
                agentId: undefined, roomId: undefined, userId: undefined,
                content: {
                    text: 'contractName: ExampleToken params: ["user2", "100"]', // Missing method
                },
            };

            const consoleErrorSpy = vi.spyOn(console, 'error');

            const result = await callContractAction.validate(mockRuntime, message);
            expect(result).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith("Message format is incorrect");
        });

        it('should log an error for missing contract name', async () => {
            const message: Memory = {
                agentId: undefined, roomId: undefined, userId: undefined,
                content: {
                    text: 'method: transfer params: ["user2", "100"]', // Missing contract name
                },
            };

            const consoleErrorSpy = vi.spyOn(console, 'error');

            const result = await callContractAction.validate(mockRuntime, message);
            expect(result).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith("Message format is incorrect");
        });

        it('should log an error for missing params', async () => {
            const message: Memory = {
                agentId: undefined, roomId: undefined, userId: undefined,
                content: {
                    text: 'contractName: ExampleToken method: transfer params: []', // Missing params
                },
            };

            const consoleErrorSpy = vi.spyOn(console, 'error');

            const result = await callContractAction.validate(mockRuntime, message);
            expect(result).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith("Invalid data format");
        });

        it('should call contract method on handler execution', async () => {
            const message: Memory = {
                agentId: undefined, roomId: undefined, userId: undefined,
                content: {
                    text: 'contractName: ExampleToken method: transfer params: ["user2", "100"]',
                },
            };

            const callback = vi.fn();

            const result = await callContractAction.handler(mockRuntime, message, {}, {}, callback);
            expect(result).toBe(true);
            expect(mockContractProvider.getContract).toHaveBeenCalledWith('ExampleToken');
            const mockContract = await mockContractProvider.getContract('ExampleToken');
            expect(mockContract.transfer).toHaveBeenCalledWith('user2', '100', { value: undefined });
            expect(callback).toHaveBeenCalledWith({
                text: `Calling ExampleToken:transfer txHash:0x123`,
                type: 'CONTRACT_CALL_SUCCESS',
                data: {
                    transactionHash: '0x123',
                    contractName: 'ExampleToken',
                    method: 'transfer',
                    params: ['user2', '100'],
                },
            });
        });

        it('should handle contract call errors', async () => {
            mockContractProvider.getContract = vi.fn().mockImplementation((contractName) => {
                if (contractName === 'ExampleToken') {
                    return {
                        transfer: vi.fn().mockRejectedValue(new Error('Test error')),
                    };
                }
                throw new Error(`Contract ${contractName} not found`);
            });

            const message: Memory = {
                agentId: undefined, roomId: undefined, userId: undefined,
                content: {
                    text: 'contractName: ExampleToken method: transfer params: ["user2", "100"]',
                },
            };

            const callback = vi.fn();

            const result = await callContractAction.handler(mockRuntime, message, {}, {}, callback);
            expect(result).toBe(false);
            expect(mockContractProvider.getContract).toHaveBeenCalledWith('ExampleToken');
            const mockContract = await mockContractProvider.getContract('ExampleToken');
            expect(mockContract.transfer).toHaveBeenCalledWith('user2', '100', { value: undefined });
            expect(callback).toHaveBeenCalledWith({
                text: `Error Calling ExampleToken:transfer error:Test error`,
                type: 'CONTRACT_CALL_ERROR',
                data: {
                    error: 'Test error',
                    contractName: 'ExampleToken',
                    method: 'transfer',
                    params: ['user2', '100'],
                },
            });
        });

        it('should handle contract call with value', async () => {
            const message: Memory = {
                content: {
                    text: 'contractName: ExampleToken method: transfer params: ["user2", "100"] value: "10"',
                },
            };

            const callback = vi.fn();

            const result = await callContractAction.handler(mockRuntime, message, {}, {}, callback);
            expect(result).toBe(true);
            expect(mockContractProvider.getContract).toHaveBeenCalledWith('ExampleToken');
            const mockContract = await mockContractProvider.getContract('ExampleToken');
            expect(mockContract.transfer).toHaveBeenCalledWith('user2', '100', { value: "10" });
            expect(callback).toHaveBeenCalledWith({
                text: `Calling ExampleToken:transfer txHash:0x123`,
                type: 'CONTRACT_CALL_SUCCESS',
                data: {
                    transactionHash: '0x123',
                    contractName: 'ExampleToken',
                    method: 'transfer',
                    params: ['user2', '100'],
                },
            });
        });

        it('should handle non-existent contract', async () => {
            const message: Memory = {
                content: {
                    text: 'contractName: NonExistentContract method: transfer params: ["user2", "100"]',
                },
            };

            const callback = vi.fn();

            const result = await callContractAction.handler(mockRuntime, message, {}, {}, callback);
            expect(result).toBe(false);
            expect(mockContractProvider.getContract).toHaveBeenCalledWith('NonExistentContract');
            expect(callback).toHaveBeenCalledWith({
                text: `Error Calling NonExistentContract:transfer error:Contract NonExistentContract not found`,
                type: 'CONTRACT_CALL_ERROR',
                data: {
                    error: 'Contract NonExistentContract not found',
                    contractName: 'NonExistentContract',
                    method: 'transfer',
                    params: ['user2', '100'],
                },
            });
        });
    });
});
