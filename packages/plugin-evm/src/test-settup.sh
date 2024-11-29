#!/bin/bash

# Starting from __tests__ directory
cd __tests__

# Create directory structure
mkdir -p {actions,providers,evaluators,integration}

# Create actions test file
cat > actions/contractActions.test.ts << 'EOL'
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { learnContractAction, callContractAction, IAgentRuntime, IMemory, IState } from '../../actions/contractActions';
import { ContractProvider } from '../../providers/contractProvider';

describe('Contract Actions', () => {
  // Test content as provided above
  let mockRuntime: IAgentRuntime;
  let mockContractProvider: ContractProvider;
  let mockContract: any;

  beforeEach(() => {
    mockContract = {
      transfer: vi.fn(),
      estimateGas: vi.fn()
    };

    mockContractProvider = {
      getContract: vi.fn().mockResolvedValue(mockContract),
      registry: {
        addContract: vi.fn(),
        getContract: vi.fn(),
        contracts: new Map()
      }
    } as unknown as ContractProvider;

    mockRuntime = {
      getProvider: vi.fn().mockReturnValue(mockContractProvider)
    };
  });

  describe('learnContractAction', () => {
    // ... rest of test content
  });

  describe('callContractAction', () => {
    // ... rest of test content
  });
});
EOL

# Create providers test file
cat > providers/contractProvider.test.ts << 'EOL'
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Contract, Provider, JsonRpcProvider } from 'ethers';
import { ContractProvider } from '../../providers/contractProvider';

vi.mock('ethers', () => ({
  Contract: vi.fn(),
  JsonRpcProvider: vi.fn()
}));

describe('ContractProvider', () => {
  // Test content as provided above
  let provider: ContractProvider;
  
  beforeEach(() => {
    vi.resetAllMocks();
    provider = new ContractProvider();
  });

  // ... rest of test content
});
EOL

# Create evaluators test file
cat > evaluators/contractEvaluator.test.ts << 'EOL'
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ContractEvaluator } from '../../evaluators/contractEvaluator';
import { IAgentRuntime } from '../../actions/contractActions';
import { ContractProvider } from '../../providers/contractProvider';

describe('ContractEvaluator', () => {
  // Test content as provided above
  let evaluator: ContractEvaluator;
  let mockRuntime: IAgentRuntime;
  let mockContract: any;
  let mockContractProvider: ContractProvider;

  beforeEach(() => {
    // ... test setup content
  });

  // ... rest of test content
});
EOL

# Create integration test files
cat > integration/contractFlow.test.ts << 'EOL'
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { ContractProvider } from '../../providers/contractProvider';
import { ContractEvaluator } from '../../evaluators/evaluators';
import { learnContractAction, callContractAction, IAgentRuntime } from '../../actions/contractActions';
import { Contract, JsonRpcProvider, Wallet } from 'ethers';

// Test content as provided above for integration tests
describe('Contract Integration Flow', () => {
  // ... full integration test content
});
EOL

cat > integration/networkSwitch.test.ts << 'EOL'
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { ContractProvider } from '../../providers/contractProvider';
import { Wallet } from 'ethers';

describe('Multi-Network Contract Interactions', () => {
  // ... network switch test content
});
EOL

# Create test helpers directory and file
mkdir -p helpers
cat > helpers/testHelpers.ts << 'EOL'
import { Wallet } from 'ethers';

export const createMockWallet = (): Wallet => {
  return Wallet.createRandom();
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
};

export const setupMockRuntime = (contractProvider: any) => ({
  getProvider: vi.fn().mockImplementation((name: string) => {
    if (name === 'ContractProvider') return contractProvider;
    return undefined;
  })
});
EOL

# Create test setup file
cat > setup.ts << 'EOL'
import { beforeAll, afterAll, vi } from 'vitest';
import { JsonRpcProvider } from 'ethers';

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
EOL

# Create vitest config
cat > vitest.config.ts << 'EOL'
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.test.ts',
        '**/*.spec.ts',
        'dist/'
      ]
    },
    include: ['**/*.{test,spec}.ts']
  },
});
EOL

# Make all files executable
chmod +x setup.ts vitest.config.ts

echo "Test files structure created successfully!"
echo "
Created files:
- actions/contractActions.test.ts
- providers/contractProvider.test.ts
- evaluators/contractEvaluator.test.ts
- integration/contractFlow.test.ts
- integration/networkSwitch.test.ts
- helpers/testHelpers.ts
- setup.ts
- vitest.config.ts
"

echo "To run tests:
1. npm run test           # Run all tests
2. npm run test:unit     # Run unit tests only
3. npm run test:integration # Run integration tests only"
EOL
