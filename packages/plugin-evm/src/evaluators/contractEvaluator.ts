import { contractProvider } from '../providers/contractProvider';
import { IAgentRuntime } from '@ai16z/eliza/src/types';
import { ContractProvider } from '../providers/contractProvider';

interface IEvaluationResult {
  isValid: boolean;
  estimatedGas: string;
  risks: readonly string[];
  suggestions: readonly string[];
}

export class ContractEvaluator {
  public async evaluateContractCall(
    runtime: IAgentRuntime,
    contractName: string,
    method: string,
    params: readonly unknown[],
  ): Promise<IEvaluationResult> {
    const risks: string[] = [];
    const suggestions: string[] = [];

    try {
      const provider = runtime.getProvider(ContractProvider) as ContractProvider;
      const contract = await provider.getContract(contractName);

      // Validate method exists
      if (typeof contract[method] !== 'function') {
        return {
          isValid: false,
          estimatedGas: '0',
          risks: ['Method does not exist on contract'],
          suggestions: ['Verify method name and contract ABI'],
        };
      }

      // Estimate gas
      let estimatedGas = '0';
      try {
        if (contract.estimateGas && typeof contract.estimateGas[method] === 'function') {
          const gasEstimate = await contract.estimateGas[method](...params);
          estimatedGas = gasEstimate.toString();
        } else {
          risks.push('Gas estimation not available');
          suggestions.push('Contract may not support gas estimation');
        }
      } catch (error) {
        risks.push('Gas estimation failed');
        suggestions.push('Verify parameter types and values');
      }

      return {
        isValid: risks.length === 0,
        estimatedGas,
        risks,
        suggestions,
      };
    } catch (error) {
      return {
        isValid: false,
        estimatedGas: '0',
        risks: ['Contract not found'],
        suggestions: ['Verify contract name and deployment'],
      };
    }
  }
}
