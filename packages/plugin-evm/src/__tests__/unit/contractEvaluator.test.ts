import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContractEvaluator } from '../../evaluators/contractEvaluator';
import { IAgentRuntime } from '@ai16z/eliza/src/types';
import { ContractProvider } from '../../providers/contractProvider';
import { contractProvider } from '../../providers/contractProvider';

describe('ContractEvaluator', () => {
    let evaluator: ContractEvaluator;
    let mockRuntime: IAgentRuntime;
    let mockContract: any;

    beforeEach(async () => {
        evaluator = new ContractEvaluator();

        // Create mock contract
        mockContract = {
            transfer: vi.fn().mockImplementation((...args) => {
                return Promise.resolve({ hash: '0x123' });
            }),
            estimateGas: {
                transfer: vi.fn().mockResolvedValue('50000'),
            },
        };

        // Mock the contract provider
        vi.spyOn(contractProvider, 'getContract').mockImplementation(async (name) => {
            if (name === 'TestContract') {
                return mockContract;
            }
            throw new Error(`Contract ${name} not found`);
        });

        // Add test contract to registry
        await contractProvider.registry.addContract({
            name: 'TestContract',
            address: '0x1234567890abcdef1234567890abcdef12345678',
            chainId: 1,
            abi: [
                "function transfer(address recipient, uint256 amount) public returns (bool)",
                "function balanceOf(address account) public view returns (uint256)"
            ],
        });

        mockRuntime = {
            getProvider: vi.fn().mockReturnValue(contractProvider),
        } as unknown as IAgentRuntime;
    });

    it('should validate a valid contract call', async () => {
        const result = await evaluator.evaluateContractCall(
            mockRuntime,
            'TestContract',
            'transfer',
            ['0x1234', '100']
        );

        expect(result.isValid).toBe(true);
        expect(result.estimatedGas).toBe('50000');
        expect(result.risks).toHaveLength(0);
    });

    it('should handle invalid method', async () => {
        const result = await evaluator.evaluateContractCall(
            mockRuntime,
            'TestContract',
            'invalidMethod',
            ['0x1234', '100']
        );

        expect(result.isValid).toBe(false);
        expect(result.risks).toContain('Method does not exist on contract');
    });

    it('should handle gas estimation failure', async () => {
        // Mock gas estimation failure
        mockContract.estimateGas.transfer.mockRejectedValue(new Error('Gas estimation failed'));

        const result = await evaluator.evaluateContractCall(
            mockRuntime,
            'TestContract',
            'transfer',
            ['0x1234', '100']
        );

        expect(result.isValid).toBe(false);
        expect(result.risks).toContain('Gas estimation failed');
        expect(result.suggestions).toContain('Verify parameter types and values');
    });

    it('should handle non-existent contract', async () => {
        const result = await evaluator.evaluateContractCall(
            mockRuntime,
            'NonExistentContract',
            'transfer',
            ['0x1234', '100']
        );

        expect(result.isValid).toBe(false);
        expect(result.risks).toContain('Contract not found');
    });
});
