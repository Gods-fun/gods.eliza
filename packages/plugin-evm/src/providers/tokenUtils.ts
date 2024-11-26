
import { Address, TokenBalance, ChainConfig, WalletPortfolio } from '../types';
import { PublicClient, createPublicClient, http, formatUnits } from 'viem';

export class TokenUtils {
    private client: PublicClient;

    constructor(chainConfig: ChainConfig) {
        this.client = createPublicClient({
            chain: chainConfig.chain,
            transport: http(chainConfig.rpcUrl)
        });
    }

    async getTokenBalances(address: Address): Promise<TokenBalance[]> {
        // Placeholder implementation
        return [];
    }

    async getNativeTokenBalance(address: Address, decimals: number): Promise<string> {
        const balance = await this.client.getBalance({ address });
        return formatUnits(balance, decimals);
    }

    async getNativePrice(chainId: number): Promise<string> {
        // Placeholder implementation
        return '0';
    }

    async getWalletPortfolio(address: Address, chainConfig: ChainConfig): Promise<WalletPortfolio> {
        const nativeBalance = await this.getNativeTokenBalance(address, chainConfig.chain.nativeCurrency.decimals);
        const nativePrice = await this.getNativePrice(chainConfig.chainId);

        const nativeValue = (Number(nativeBalance) * Number(nativePrice)).toString();

        const nativeToken: TokenBalance = {
            token: '0x0000000000000000000000000000000000000000',
            symbol: chainConfig.chain.nativeCurrency.symbol,
            balance: nativeBalance,
            decimals: chainConfig.chain.nativeCurrency.decimals,
            price: nativePrice,
        };

        const tokenBalances = await this.getTokenBalances(address);

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
