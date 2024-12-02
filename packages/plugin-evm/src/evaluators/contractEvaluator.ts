import { contractProvider } from '../providers/contractProvider';
import { IAgentRuntime } from '@ai16z/eliza/src/types';

interface IEvaluationResult {
  isValid: boolean;
  estimatedGas: string;
  risks: readonly string[];
  suggestions: readonly string[];
}

export class ContractEvaluator {
  public async evaluateContractCall(
    _runtime: IAgentRuntime,
    contractName: string,
    method: string,
    params: readonly unknown[],
  ): Promise<IEvaluationResult> {
    const contract = await contractProvider.getContract(contractName);

    const risks: string[] = [];
    const suggestions: string[] = [];

    // Validate method exists
    if (typeof contract[method] !== 'function') {
      return {
        isValid: false,
        estimatedGas: '0',
        risks: ['Method does not exist on contract'],
        suggestions: ['Verify method name and contract ABI'],
      };
    }

    // Estimate gas (this is a simplified example)
    let estimatedGas = '0';
    try {
      const gasEstimate = await contract[method].estimateGas(...params);
      estimatedGas = gasEstimate.toString();
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
  }
}
