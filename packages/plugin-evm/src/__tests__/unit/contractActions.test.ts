import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContractProvider } from '@/providers/contractProvider';
import { learnContractAction, callContractAction } from '@/actions/contractActions';
import { IAgentRuntime, Memory } from '@ai16z/eliza/src/types';
import { IContractDefinition, IContractCall } from '@/types/contracts';


describe('Contract Actions', () => {
  let mockRuntime: IAgentRuntime;
  let mockContractProvider: ContractProvider;

  beforeEach(() => {
    mockContractProvider = {
      registry: {
        addContract: vi.fn(),
        getContract: vi.fn(),
      },
      getContract: vi.fn(),
    } as unknown as ContractProvider;

    mockRuntime = {
      // Add properties from core IAgentRuntime as needed
    } as IAgentRuntime;

    // Add getProvider method to mockRuntime
    (mockRuntime as any).getProvider = vi.fn().mockReturnValue(mockContractProvider);
  });

  describe('learnContractAction', () => {
    it('should validate correct contract definition', async () => {
      const validMessage: Memory = {
        data: {
          address: '0x1234567890123456789012345678901234567890',
          chainId: 1,
          abi: ['function test()'],
          name: 'TestContract',
        } as IContractDefinition,
      };

      const result = await learnContractAction.validate(mockRuntime, validMessage);
      expect(result).toBe(true);
    });

    it('should invalidate incorrect contract definition', async () => {
      const invalidMessage: Memory = {
        data: {
          address: '0x1234567890123456789012345678901234567890',
          chainId: '1', // Should be a number
          abi: ['function test()'],
          name: 'TestContract',
        } as unknown as IContractDefinition,
      };

      const result = await learnContractAction.validate(mockRuntime, invalidMessage);
      expect(result).toBe(false);
    });

    it('should add contract to registry on handler execution', async () => {
      const message: Memory = {
        data: {
          address: '0x1234567890123456789012345678901234567890',
          chainId: 1,
          abi: ['function test()'],
          name: 'TestContract',
        } as IContractDefinition,
      };

      const result = await learnContractAction.handler(mockRuntime, message, {}, {});
      expect(result).toBe(true);
      expect(mockContractProvider.registry.addContract).toHaveBeenCalledWith(message.data);
    });
  });

  describe('callContractAction', () => {
    it('should validate correct contract call', async () => {
      const validMessage: Memory = {
        data: {
          contractName: 'TestContract',
          method: 'test',
          params: ['param1', 'param2'],
        } as IContractCall,
      };

      const result = await callContractAction.validate(mockRuntime, validMessage);
      expect(result).toBe(true);
    });

    it('should invalidate incorrect contract call', async () => {
      const invalidMessage: Memory = {
        data: {
          contractName: 'TestContract',
          method: 'test',
          params: 'invalid params', // Should be an array
        } as unknown as IContractCall,
      };

      const result = await callContractAction.validate(mockRuntime, invalidMessage);
      expect(result).toBe(false);
    });

    it('should call contract method on handler execution', async () => {
      const mockContract = {
        testMethod: vi.fn().mockResolvedValue({ hash: '0x123' }),
      };
      vi.mocked(mockContractProvider.getContract).mockResolvedValue(mockContract as any);

      const message: Memory = {
        data: {
          contractName: 'TestContract',
          method: 'testMethod',
          params: ['param1', 'param2'],
        } as IContractCall,
      };

      const callback = vi.fn();

      const result = await callContractAction.handler(mockRuntime, message, {}, {}, callback);
      expect(result).toBe(true);
      expect(mockContract.testMethod).toHaveBeenCalledWith('param1', 'param2', { value: undefined });
      expect(callback).toHaveBeenCalledWith({
        type: 'CONTRACT_CALL_SUCCESS',
        data: {
          transactionHash: '0x123',
          contractName: 'TestContract',
          method: 'testMethod',
          params: ['param1', 'param2'],
        },
      });
    });

    it('should handle contract call errors', async () => {
      const mockContract = {
        testMethod: vi.fn().mockRejectedValue(new Error('Test error')),
      };
      vi.mocked(mockContractProvider.getContract).mockResolvedValue(mockContract as any);

      const message: Memory = {
        data: {
          contractName: 'TestContract',
          method: 'testMethod',
          params: ['param1', 'param2'],
        } as IContractCall,
      };

      const callback = vi.fn();

      const result = await callContractAction.handler(mockRuntime, message, {}, {}, callback);
      expect(result).toBe(false);
      expect(callback).toHaveBeenCalledWith({
        type: 'CONTRACT_CALL_ERROR',
        data: {
          error: 'Test error',
          contractName: 'TestContract',
          method: 'testMethod',
          params: ['param1', 'param2'],
        },
      });
    });
  });
});