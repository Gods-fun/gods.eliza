import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Contract, Provider, JsonRpcProvider, Signer } from 'ethers';
import { ContractProvider } from '../../providers/contractProvider';
import { IContractDefinition } from '../../types/contracts';

vi.mock('ethers', () => ({
    Contract: vi.fn(),
    JsonRpcProvider: vi.fn()
}));

describe('ContractProvider', () => {
    let provider: ContractProvider;
    let mockJsonRpcProvider: ReturnType<typeof vi.fn>;
    let mockContract: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.resetAllMocks();
        mockJsonRpcProvider = JsonRpcProvider as unknown as ReturnType<typeof vi.fn>;
        mockContract = Contract as unknown as ReturnType<typeof vi.fn>;
        provider = new ContractProvider();
        process.env.RPC_URL_1 = 'https://mainnet.example.com';
        process.env.RPC_URL_5 = 'https://goerli.example.com';
    });

    describe('getProvider', () => {
        it('should return an existing provider if available', async () => {
            const mockProvider = {} as Provider;
            provider['providers'].set(1, mockProvider);

            const result = await provider.getProvider(1);

            expect(result).toBe(mockProvider);
            expect(mockJsonRpcProvider).not.toHaveBeenCalled();
        });

        it('should create a new provider if not available', async () => {
            const mockProvider = {} as Provider;
            mockJsonRpcProvider.mockReturnValue(mockProvider);

            const result = await provider.getProvider(1);

            expect(result).toBe(mockProvider);
            expect(mockJsonRpcProvider).toHaveBeenCalledWith('https://mainnet.example.com');
        });

        it('should throw an error if RPC URL is not configured', async () => {
            await expect(provider.getProvider(999)).rejects.toThrow('No RPC URL configured for chain ID 999');
        });
    });

    describe('getContract', () => {
        it('should return a contract instance', async () => {
            const mockContractDef: IContractDefinition = {
                name: 'TestContract',
                address: '0x1234567890123456789012345678901234567890',
                chainId: 1,
                abi: ['function test()']
            };
            await provider.registry.addContract(mockContractDef);

            const mockProvider = {} as Provider;
            mockJsonRpcProvider.mockReturnValue(mockProvider);

            const mockContractInstance = {} as Contract;
            mockContract.mockReturnValue(mockContractInstance);

            const result = await provider.getContract('TestContract');

            expect(result).toBe(mockContractInstance);
            expect(mockContract).toHaveBeenCalledWith(
                mockContractDef.address,
                mockContractDef.abi,
                mockProvider
            );
        });

        it('should use provided signer if available', async () => {
            const mockContractDef: IContractDefinition = {
                name: 'TestContract',
                address: '0x1234567890123456789012345678901234567890',
                chainId: 1,
                abi: ['function test()']
            };
            await provider.registry.addContract(mockContractDef);

            const mockSigner = {} as Signer;
            const mockContractInstance = {} as Contract;
            mockContract.mockReturnValue(mockContractInstance);

            const result = await provider.getContract('TestContract', mockSigner);

            expect(result).toBe(mockContractInstance);
            expect(mockContract).toHaveBeenCalledWith(
                mockContractDef.address,
                mockContractDef.abi,
                mockSigner
            );
        });

        it('should throw an error if contract is not found', async () => {
            await expect(provider.getContract('NonExistentContract')).rejects.toThrow('Contract NonExistentContract not found');
        });
    });

    describe('registry', () => {
        it('should add and retrieve contracts', async () => {
            const mockContractDef: IContractDefinition = {
                name: 'TestContract',
                address: '0x1234567890123456789012345678901234567890',
                chainId: 1,
                abi: ['function test()']
            };

            await provider.registry.addContract(mockContractDef);
            const retrievedContract = await provider.registry.getContract('TestContract');

            expect(retrievedContract).toEqual(mockContractDef);
        });

        it('should return undefined for non-existent contracts', async () => {
            const retrievedContract = await provider.registry.getContract('NonExistentContract');

            expect(retrievedContract).toBeUndefined();
        });
    });
});
