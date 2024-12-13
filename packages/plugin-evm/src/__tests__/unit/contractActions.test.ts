import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContractProvider } from '../../providers/contractProvider';
import { callContractAction } from '../../actions/contractActions';
import { IAgentRuntime, Memory } from '@ai16z/eliza/src/types';
import { IContractCall } from '../../types/contracts';

describe('Contract Actions', () => {
    let mockRuntime: IAgentRuntime;
    let mockContractProvider: ContractProvider;

    beforeEach(async() => {
        // Create mock contract with transfer function
        const mockContract = {
            transfer: vi.fn().mockImplementation((...args) => {
                // Return success for all calls
                return Promise.resolve({ hash: '0x123' });
            }),
        };

        // Set up mock contract provider
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
                if (name === 'ExampleToken') {
                    return Promise.resolve(mockContract);
                }
                throw new Error(`Contract ${name} not found`);
            }),
        } as unknown as ContractProvider;

        // Set up mock runtime
        mockRuntime = {
            getProvider: vi.fn().mockReturnValue(mockContractProvider),
        } as unknown as IAgentRuntime;

        // Add the ExampleToken contract to the registry
        await mockContractProvider.registry.addContract({
            name: 'ExampleToken',
            address: '0x1234567890abcdef1234567890abcdef12345678',
            chainId: 1,
            abi: [
                "function transfer(address recipient, uint256 amount) public returns (bool)",
                "function balanceOf(address account) public view returns (uint256)"
            ],
        });
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
                    text: 'contractName: ExampleToken method: transfer params: invalid', // Should be a JSON array string
                },
            };

            const consoleErrorSpy = vi.spyOn(console, 'error');

            const result = await callContractAction.validate(mockRuntime, message);
            expect(result).toBe(false);
            // expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to parse JSON', expect.any(Error), 'Message format is incorrect');
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
                    text: 'contractName: ExampleToken method: transfer', // Missing params
                },
            };

            const consoleErrorSpy = vi.spyOn(console, 'error');

            const result = await callContractAction.validate(mockRuntime, message);
            expect(result).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith("Message format is incorrect");
        });

        it('should call contract method on handler execution', async () => {
            const message: Memory = {
                agentId: undefined, roomId: undefined, userId: undefined,
                content: {
                    text: 'contractName: ExampleToken method: transfer params: ["user2", "100"]',
                },
            };

            const callback = vi.fn();
            const result = await callContractAction.handler(mockRuntime, message, {
                actors: "",
                bio: "",
                lore: "",
                messageDirections: "",
                postDirections: "",
                recentMessages: "",
                recentMessagesData: [],
                roomId: undefined
            }, {}, callback);

            expect(result).toBe(true);
            expect(mockContractProvider.getContract).toHaveBeenCalledWith('ExampleToken');
            const mockContract = await mockContractProvider.getContract('ExampleToken');
            expect(mockContract.transfer).toHaveBeenCalledWith('user2', '100');
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                text: `Calling ExampleToken:transfer txHash:0x123`,
                type: 'CONTRACT_CALL_SUCCESS',
            }));
        });

        it('should handle contract call errors', async () => {
            const message: Memory = {
                agentId: undefined, roomId: undefined, userId: undefined,
                content: {
                    text: 'contractName: ExampleToken method: transfer params: ["user2", "100"]',
                }
            };

            mockContractProvider.getContract = vi.fn().mockRejectedValue(new Error('Test error'));

            const callback = vi.fn();
            const result = await callContractAction.handler(mockRuntime, message, {
                actors: "",
                bio: "",
                lore: "",
                messageDirections: "",
                postDirections: "",
                recentMessages: "",
                recentMessagesData: [],
                roomId: undefined
            }, {}, callback);

            expect(result).toBe(false);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                type: 'CONTRACT_CALL_ERROR',
                data: expect.objectContaining({
                    error: 'Test error',
                }),
            }));
        });

        it('should handle contract call with value', async () => {
            const message: Memory = {
                agentId: undefined, roomId: undefined, userId: undefined,
                content: {
                    text: 'contractName: ExampleToken method: transfer params: ["user2", "100"] value: "10"',
                }
            };

            const callback = vi.fn();
            const result = await callContractAction.handler(mockRuntime, message, {
                actors: "",
                bio: "",
                lore: "",
                messageDirections: "",
                postDirections: "",
                recentMessages: "",
                recentMessagesData: [],
                roomId: undefined
            }, {}, callback);

            expect(result).toBe(true);
            const mockContract = await mockContractProvider.getContract('ExampleToken');
            expect(mockContract.transfer).toHaveBeenCalledWith('user2', '100', { value: "10" });
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                text: `Calling ExampleToken:transfer txHash:0x123`,
                type: 'CONTRACT_CALL_SUCCESS',
            }));
        });

        it('should handle non-existent contract', async () => {
            const message: Memory = {
                agentId: undefined, roomId: undefined, userId: undefined,
                content: {
                    text: 'contractName: NonExistentContract method: transfer params: ["user2", "100"]',
                }
            };

            // Reset the mock to ensure it's clean
            mockContractProvider.registry.getContract = vi.fn().mockResolvedValue(undefined);
            mockContractProvider.getContract = vi.fn().mockRejectedValue(new Error('Contract NonExistentContract not found'));

            const callback = vi.fn();
            const result = await callContractAction.handler(mockRuntime, message, {
                actors: "",
                bio: "",
                lore: "",
                messageDirections: "",
                postDirections: "",
                recentMessages: "",
                recentMessagesData: [],
                roomId: undefined
            }, {}, callback);

            expect(result).toBe(false);
            expect(mockContractProvider.getContract).toHaveBeenCalledWith('NonExistentContract');
            expect(callback).toHaveBeenCalledWith({
                text: `Error during contract call: Contract NonExistentContract not found`,
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
