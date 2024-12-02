import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ContractEvaluator } from '../../evaluators/contractEvaluator';
import { IAgentRuntime } from "@ai16z/eliza/src/types";
import { ContractProvider } from '../../providers/contractProvider';

describe('ContractEvaluator', () => {
  let evaluator: ContractEvaluator;
  let mockRuntime: IAgentRuntime;
  let mockContract: any;
  let mockContractProvider: ContractProvider;

  beforeEach(() => {
    evaluator = new ContractEvaluator();
    mockContract = {
      validMethod: {
        estimateGas: vi.fn(),
      },
    };
    mockContractProvider = {
      getContract: vi.fn().mockResolvedValue(mockContract),
    } as unknown as ContractProvider;
    mockRuntime = {
      getProvider: vi.fn().mockReturnValue(mockContractProvider),
    };
  });

  it('should return invalid result for non-existent method', async () => {
    const result = await evaluator.evaluateContractCall(
        mockRuntime,
        'TestContract',
        'nonExistentMethod',
        []
    );

    expect(result).toEqual({
      isValid: false,
      estimatedGas: '0',
      risks: ['Method does not exist on contract'],
      suggestions: ['Verify method name and contract ABI'],
    });
  });

  it('should return valid result for existing method with successful gas estimation', async () => {
    mockContract.validMethod.estimateGas.mockResolvedValue('1000');

    const result = await evaluator.evaluateContractCall(
        mockRuntime,
        'TestContract',
        'validMethod',
        ['param1', 'param2']
    );

    expect(result).toEqual({
      isValid: true,
      estimatedGas: '1000',
      risks: [],
      suggestions: [],
    });
    expect(mockContract.validMethod.estimateGas).toHaveBeenCalledWith('param1', 'param2');
  });

  it('should return invalid result when gas estimation fails', async () => {
    mockContract.validMethod.estimateGas.mockRejectedValue(new Error('Gas estimation failed'));

    const result = await evaluator.evaluateContractCall(
        mockRuntime,
        'TestContract',
        'validMethod',
        ['param1', 'param2']
    );

    expect(result).toEqual({
      isValid: false,
      estimatedGas: '0',
      risks: ['Gas estimation failed'],
      suggestions: ['Verify parameter types and values'],
    });
  });

  it('should use ContractProvider to get the contract', async () => {
    mockContract.validMethod.estimateGas.mockResolvedValue('1000');

    await evaluator.evaluateContractCall(
        mockRuntime,
        'TestContract',
        'validMethod',
        []
    );

    expect(mockRuntime.getProvider).toHaveBeenCalledWith('ContractProvider');
    expect(mockContractProvider.getContract).toHaveBeenCalledWith('TestContract');
  });

  it('should handle errors thrown by getContract', async () => {
    vi.mocked(mockContractProvider.getContract).mockImplementation(() => {
      throw new Error('Contract not found');
    });

    const result = await evaluator.evaluateContractCall(
        mockRuntime,
        'NonExistentContract',
        'someMethod',
        []
    );

    expect(result).toEqual({
      isValid: false,
      estimatedGas: '0',
      risks: ['Contract not found'],
      suggestions: ['Verify contract name and ensure it is properly registered'],
    });
  });
});
