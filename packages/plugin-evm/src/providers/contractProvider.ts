import { Contract, Provider, JsonRpcProvider, Signer } from 'ethers';

import { IContractDefinition, IContractRegistry } from '../types/contracts';

export class ContractProvider {
  readonly registry: IContractRegistry;
  private readonly providers: Map<number, Provider>;

  public constructor() {
      this.registry = {
          contracts: new Map<string, IContractDefinition>(),
          async addContract(contract: IContractDefinition): Promise<void> {
              this.contracts.set(contract.name, contract);
          },
          async getContract(name: string): Promise<IContractDefinition | undefined> {
            return this.contracts.get(name);
          },
      };
      this.providers = new Map<number, Provider>();
  }

  public async getProvider(chainId: number): Promise<Provider> {
    const existingProvider = this.providers.get(chainId);
    if (existingProvider !== undefined) {
      return existingProvider;
    }

    const rpcUrl = this.getRpcUrl(chainId);
    const provider = new JsonRpcProvider(rpcUrl);
    this.providers.set(chainId, provider);

    return provider;
  }

  public async getContract(name: string, signer?: Signer): Promise<Contract> {
    const contractDef = await this.registry.getContract(name);
    if (contractDef === undefined) {
      throw new Error(`Contract ${name} not found`);
    }

    const provider = await this.getProvider(contractDef.chainId);
    return new Contract(
      contractDef.address,
      contractDef.abi,
      signer ?? provider
    );
  }

  private getRpcUrl(chainId: number): string {
    const envKey = `RPC_URL_${chainId}`;
    const rpcUrl = process.env[envKey];
    if (rpcUrl === undefined) {
      throw new Error(`No RPC URL configured for chain ID ${chainId}`);
    }
    return rpcUrl;
  }
}

export const contractProvider = new ContractProvider();

