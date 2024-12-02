import { ContractProvider } from '../providers/contractProvider';
import {
    IContractDefinition,
    IContractCall
} from '../types/contracts';
import {contractProvider} from "../providers/contractProvider";
import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from '@ai16z/eliza/src/types';

export const learnContractAction: Action = {
    name: "LEARN_CONTRACT",
    similes: ["REMEMBER_CONTRACT", "ADD_CONTRACT"],
    description: "Learn a contract from a message",
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Learn a new contract.",
                    data: {
                        address: "0x1234567890abcdef1234567890abcdef12345678",
                        chainId: 1,
                        abi: [
                            "function transfer(address recipient, uint256 amount) public returns (bool)",
                            "function balanceOf(address account) public view returns (uint256)"
                        ],
                        name: "ExampleToken",
                        description: "A simple ERC-20 token for demonstration purposes."
                    }
                }
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Contract ExampleToken learned successfully.",
                    data: {
                        address: "0x1234567890abcdef1234567890abcdef12345678",
                        chainId: 1,
                        abi: [
                            "function transfer(address recipient, uint256 amount) public returns (bool)",
                            "function balanceOf(address account) public view returns (uint256)"
                        ],
                        name: "ExampleToken",
                        description: "A simple ERC-20 token for demonstration purposes."
                    }
                }
            }
        ]
    ],
    validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
        const data = parseContractDefinition(message.content.text);
        return data !== null && typeof data.address === 'string' && typeof data.chainId === 'number' && Array.isArray(data.abi) && typeof data.name === 'string';
    },
    handler: async (runtime: IAgentRuntime, message: Memory, _state: State, _options: { [key: string]: unknown }, callback?: HandlerCallback): Promise<boolean> => {
        const data = parseContractDefinition(message.content.text);
        if (!data) {
            return false;
        }
        try {
            await contractProvider.registry.addContract(data);
            if (callback) {
                await callback({
                    text: `Contract ${data.name} learned successfully.`,
                    type: 'CONTRACT_LEARN_SUCCESS',
                    data,
                });
            }
            return true;
        } catch (error) {
            console.error("Failed to learn contract", error);
            if (callback) {
                await callback({
                    text: `Failed to learn contract ${data.name}.`,
                    type: 'CONTRACT_LEARN_ERROR',
                    data: { error: (error as Error).message }
                });
            }
            return false;
        }
    }
};

// Helper function to parse contract definition from text
function parseContractDefinition(text: string): IContractDefinition | null {
    try {
        return JSON.parse(text) as IContractDefinition;
    } catch (error) {
        console.error("Failed to parse contract definition from text", error);
        return null;
    }
}

function parseUserMessageToContractCall(message: string): IContractCall | null {
    const contractNameMatch = message.match(/contractName\s*[:=]\s*(\w+)/i);
    const methodMatch = message.match(/method\s*[:=]\s*(\w+)/i);
    const paramsMatch = message.match(/params\s*[:=]\s*(\[[^\]]*\])/i);

    if (!contractNameMatch || !methodMatch || !paramsMatch) {
        console.error("Message format is incorrect");
        return null;
    }

    const contractName = contractNameMatch[1];
    const method = methodMatch[1];
    let params;

    try {
        params = JSON.parse(paramsMatch[1]);
    } catch (error) {
        console.error("Failed to parse JSON", error);
        return null;
    }

    if (typeof contractName !== 'string' || typeof method !== 'string' || !Array.isArray(params)) {
        console.error("Invalid data format");
        return null;
    }

    return {
        contractName,
        method,
        params,
    };
}


export const callContractAction: Action = {
    name: 'CALL_CONTRACT',
    similes: ['EXECUTE_CONTRACT', 'INTERACT_CONTRACT'],
    description: 'Make arbitrary contract calls to contracts already in memory.',
    validate: async (
        _runtime: IAgentRuntime,
        message: Memory
    ): Promise<boolean> => {
        let data = parseUserMessageToContractCall(message.content.text) as IContractCall;
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
        const data = parseUserMessageToContractCall(message.content.text);
        if (!data) {
            return false;
        }

        const { contractName, method, params, value } = data;

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
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "call transfer on ExampleToken with the params :[\"{{user2}}\", \"100\"]",
                }
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Calling ExampleToken:transfer txHash:0x1234567890abcdef1234567890abcdef12345678",
                    type: "CONTRACT_CALL_SUCCESS",
                    data: {
                        transactionHash: "0x1234567890abcdef1234567890abcdef12345678",
                        contractName: "ExampleToken",
                        method: "transfer",
                        params: ["{{user2}}", "100"]
                    }
                }
            }
        ]
    ]
};
