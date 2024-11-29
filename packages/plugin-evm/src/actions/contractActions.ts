import { ContractProvider } from '@/providers/contractProvider';
import {
    IContractDefinition,
    IContractCall
} from '@/types/contracts';

import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from '@ai16z/eliza/src/types';
import {getProviders} from "@ai16z/eliza";

export const learnContractAction: Action = {
    name: "LEARN_CONTRACT",
    similes: ["REMEMBER_CONTRACT", "ADD_CONTRACT"],
    validate: async (
        _runtime: IAgentRuntime,
        message: Memory
    ): Promise<boolean> => {
        const data = message.data as IContractDefinition;
        return (
            typeof data.address === "string" &&
            typeof data.chainId === "number" &&
            Array.isArray(data.abi) &&
            typeof data.name === "string"
        );
    },
    handler: async (
        _runtime: IAgentRuntime,
        _message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        try {
            const contractProvider = getProvider<ContractProvider>("ContractProvider");
            const contractData: IContractDefinition = {
                address: response.address,
                chainId: response.chainId,
                abi: response.abi,
                name: response.name
            };

            contractProvider.registry.addContract(contractData);

            console.log("Contract learned successfully!");

            const responseMsg = {
                text: `Contract ${response.name} has been successfully learned and stored.`,
            };

            callback?.(responseMsg);

            return true;
        } catch (error) {
            console.error("Error during contract learning:", error);
            return false;
        }
    }
};

export const callContractAction: Action = {
    name: 'CALL_CONTRACT',
    similes: ['EXECUTE_CONTRACT', 'INTERACT_CONTRACT'],
    validate: async (
        _runtime: IAgentRuntime,
        message: Memory
    ): Promise<boolean> => {
        const data = message.data as IContractCall;
        return (
            typeof data.contractName === 'string' &&
            typeof data.method === 'string' &&
            Array.isArray(data.params)
        );
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        const contractProvider =
            getProviders<ContractProvider>('ContractProvider');
        const { contractName, method, params, value } = message.data as IContractCall;

        try {
            const contract = await contractProvider.getContract(contractName);
            const result = await contract[method](...params, { value });

            if (callback) {
                await callback({
                    text: `Calling ${contractName}:${method} txHash:${result.hash}`,
                    type: 'CONTRACT_CALL_SUCCESS',
                    data: {
                        transactionHash: result.hash,
                        contractName,
                        method,
                        params
                    }
                });
            }

            return true;
        } catch (error) {
            if (callback) {
                await callback({
                    text: `Error Calling ${contractName}:${method} error:${(error as Error).message}`,
                    type: 'CONTRACT_CALL_ERROR',
                    data: {
                        error: (error as Error).message,
                        contractName,
                        method,
                        params
                    }
                });
            }

            return false;
        }
    }
};