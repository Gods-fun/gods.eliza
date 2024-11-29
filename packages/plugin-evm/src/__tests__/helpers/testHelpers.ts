import { Wallet, JsonRpcProvider } from 'ethers';
import { vi } from 'vitest';

export const createMockWallet = (): Wallet => {
  return {
    address: '0x' + '1'.repeat(40),
    connect: vi.fn().mockReturnThis(),
  } as unknown as Wallet;
};

export const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 amount)'
];

export const mockProvider = {
  getBlockNumber: vi.fn().mockResolvedValue(1),
  getGasPrice: vi.fn().mockResolvedValue('1000000000'),
} as unknown as JsonRpcProvider;

export const setupMockRuntime = (contractProvider: any) => ({
  getProvider: vi.fn().mockImplementation((name: string) => {
    if (name === 'ContractProvider') return contractProvider;
    return undefined;
  })
});