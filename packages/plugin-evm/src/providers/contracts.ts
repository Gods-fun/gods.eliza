import { type Address } from 'viem';

export const UNISWAP_V2_ROUTER_ABI =[
    {
        inputs: [
            { name: "amountIn", type: "uint256" },
            { name: "amountOutMin", type: "uint256" },
            { name: "path", type: "address[]" },
            { name: "to", type: "address" },
            { name: "deadline", type: "uint256" }
        ],
        name: "swapExactTokensForTokens",
        outputs: [{ name: "amounts", type: "uint256[]" }],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [
            { name: "amountOutMin", type: "uint256" },
            { name: "path", type: "address[]" },
            { name: "to", type: "address" },
            { name: "deadline", type: "uint256" }
        ],
        name: "swapExactETHForTokens",
        outputs: [{ name: "amounts", type: "uint256[]" }],
        stateMutability: "payable",
        type: "function"
    }
] as const;

export const ERC20_ABI = [{
    inputs: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ name: "success", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
}] as const;

export class ContractProvider {
    private static instance: ContractProvider;
    
    // Mainnet addresses
    private readonly UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' as Address;
    
    private constructor() {}
    
    public static getInstance(): ContractProvider {
        if (!ContractProvider.instance) {
            ContractProvider.instance = new ContractProvider();
        }
        return ContractProvider.instance;
    }
    
    public getRouterAddress(): Address {
        return this.UNISWAP_V2_ROUTER;
    }
    
    public getRouterAbi() {
        return UNISWAP_V2_ROUTER_ABI;
    }
    
    public getErc20Abi() {
        return ERC20_ABI;
    }
}
