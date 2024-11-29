import { BigNumberish } from 'ethers';

export interface IContractDefinition {
  address: string;
  chainId: number;
  abi: string[];
  name: string;
  description?: string;
}

export interface IContractCall {
  contractName: string;
  method: string;
  params: readonly unknown[];
  value?: BigNumberish;
}

export interface IContractRegistry {
  contracts: Map<string, IContractDefinition>;
  addContract(contract: IContractDefinition): void;
  getContract(name: string): IContractDefinition | undefined;
}

export interface ITransactionResult {
  transactionHash: string;
  contractName: string;
  method: string;
  params: readonly unknown[];
}

export interface ITransactionError {
  error: string;
  contractName: string;
  method: string;
  params: readonly unknown[];
}

export type ContractCallbackData = 
  | { type: 'CONTRACT_CALL_SUCCESS'; data: ITransactionResult }
  | { type: 'CONTRACT_CALL_ERROR'; data: ITransactionError };
