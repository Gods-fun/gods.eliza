import { createPublicClient, http, formatUnits, PublicClient } from 'viem';
import { Address, ChainConfig, TokenBalance, WalletPortfolio, TokenData } from '../types';
import axios from 'axios';

export class BalancesProvider {
    private client: PublicClient;

    constructor(chainConfig: ChainConfig) {
        this.client = createPublicClient({
            chain: chainConfig.chain,
            transport: http(chainConfig.rpcUrl)
        });
    }

    async getTokenBalances(address: Address, tokens: TokenData[]): Promise<TokenBalance[]> {
        const balances = await Promise.all(tokens.map(async (token) => {
            const balance = await this.client.readContract({
                address: token.address,
                abi: [{
                    inputs: [{ name: '_owner', type: 'address' }],
                    name: 'balanceOf',
                    outputs: [{ name: 'balance', type: 'uint256' }],
                    type: 'function',
                    stateMutability: 'view'
                }],
                functionName: 'balanceOf',
                args: [address],
            });

            const formattedBalance = formatUnits(balance as bigint, token.decimals);
            const price = await this.getTokenPrice(token.address, token.chainId);

            return {
                token: token.address,
                symbol: token.symbol,
                balance: formattedBalance,
                decimals: token.decimals,
                price,
            };
        }));

        return balances;
    }

    async getNativeTokenBalance(address: Address, decimals: number): Promise<string> {
        const balance = await this.client.getBalance({ address });
        return formatUnits(balance, decimals);
    }

    async getTokenPrice(tokenAddress: Address, chainId: number): Promise<string> {
        const response = await axios.get(`https://api.coingecko.com/api/v3/simple/token_price/${chainId}?contract_addresses=${tokenAddress}&vs_currencies=usd`);
        return response.data[tokenAddress.toLowerCase()].usd.toString();
    }

    async getNativePrice(chainId: number): Promise<string> {
        const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${this.getChainCoinGeckoId(chainId)}&vs_currencies=usd`);
        return response.data[this.getChainCoinGeckoId(chainId)].usd.toString();
    }

    private getChainCoinGeckoId(chainId: number): string {
        switch (chainId) {
            case 1: return 'ethereum';
            case 56: return 'binancecoin';
            case 137: return 'matic-network';
            // Add more chains as needed
            default: throw new Error(`Unsupported chain ID: ${chainId}`);
        }
    }

    async getWalletPortfolio(address: Address, chainConfig: ChainConfig, tokens: TokenData[]): Promise<WalletPortfolio> {
        const nativeBalance = await this.getNativeTokenBalance(address, chainConfig.chain.nativeCurrency.decimals);
        const nativePrice = await this.getNativePrice(chainConfig.chainId);

        const nativeValue = (Number(nativeBalance) * Number(nativePrice)).toString();

        const nativeToken: TokenBalance = {
            token: '0x0000000000000000000000000000000000000000' as Address,
            symbol: chainConfig.chain.nativeCurrency.symbol,
            balance: nativeBalance,
            decimals: chainConfig.chain.nativeCurrency.decimals,
            price: nativePrice,
        };

        const tokenBalances = await this.getTokenBalances(address, tokens);

        const totalValue = tokenBalances.reduce((acc, token) => {
            return acc + (Number(token.balance) * Number(token.price));
        }, Number(nativeValue)).toString();

        return {
            nativeToken,
            tokens: tokenBalances,
            totalValue,
        };
    }
}
