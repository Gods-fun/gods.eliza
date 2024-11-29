import { beforeAll, afterAll, vi } from 'vitest';
// import { JsonRpcProvider } from 'ethers';

beforeAll(() => {
  // Setup global test environment
  process.env.RPC_URL_31337 = 'http://localhost:8545';
  vi.mock('ethers', () => ({
    JsonRpcProvider: vi.fn(),
    Contract: vi.fn(),
    Wallet: {
      createRandom: () => ({
        address: '0x' + '1'.repeat(40),
        connect: vi.fn().mockReturnThis(),
      }),
    },
  }));
});

afterAll(() => {
  vi.clearAllMocks();
});
