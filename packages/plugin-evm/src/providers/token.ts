
import axios from 'axios';
import { NetworkRegistry } from '../adapters/networkRegistry';
import { Address, TokenData } from '../types';
import { WalletProvider } from './wallet';

export class TokenProvider {
    private walletProvider: WalletProvider;
    private networkRegistry: NetworkRegistry;

    constructor(walletProvider: WalletProvider, networkRegistry: NetworkRegistry) {
        this.walletProvider = walletProvider;
        this.networkRegistry = networkRegistry;
    }

    private async fetchContractInfo(address: Address, chainId: number): Promise<any> {
        const apiKey = process.env.ETHERSCAN_API_KEY;
        const url = `https://api.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=${apiKey}`;

        try {
            const response = await axios.get(url);
            if (response.data.status === '1') {
                return JSON.parse(response.data.result);
            } else {
                throw new Error(`Etherscan API error: ${response.data.message}`);
            }
        } catch (error) {
            console.error('Error fetching contract info:', error);
            throw error;
        }
    }

    private async fetchHolderDistribution(address: Address, chainId: number): Promise<any> {
        const apiKey = process.env.COVALENT_API_KEY;
        const url = `https://api.covalenthq.com/v1/${chainId}/tokens/${address}/token_holders/?key=${apiKey}`;

        try {
            const response = await axios.get(url);
            return response.data.data.items;
        } catch (error) {
            console.error('Error fetching holder distribution:', error);
            throw error;
        }
    }

    private async fetchDexStats(address: Address, chainId: number): Promise<any> {
        const apiKey = process.env.DEXGURU_API_KEY;
        const url = `https://api.dex.guru/v1/tokens/${address}-${chainId}`;

        try {
            const response = await axios.get(url, {
                headers: { 'api-key': apiKey }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching DEX stats:', error);
            throw error;
        }
    }

    private async getNativeTokenPrice(chainId: number): Promise<number> {
        const coingeckoId = chainId === 1 ? 'ethereum' : 'base';
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`;

        try {
            const response = await axios.get(url);
            return response.data[coingeckoId].usd;
        } catch (error) {
            console.error('Error fetching native token price:', error);
            throw error;
        }
    }

    public async getTokenDetails(address: Address, chainId: number): Promise<TokenData & {
        contractInfo: any;
        holderDistribution: any;
        dexStats: any;
        price: number;
    }> {
        const [
            contractInfo,
            holderDistribution,
            dexStats,
            nativePrice
        ] = await Promise.all([
            this.fetchContractInfo(address, chainId),
            this.fetchHolderDistribution(address, chainId),
            this.fetchDexStats(address, chainId),
            this.getNativeTokenPrice(chainId)
        ]);

        const tokenPriceInNative = dexStats.priceNative || 0;
        const tokenPriceUsd = tokenPriceInNative * nativePrice;

        return {
            contractInfo,
            holderDistribution,
            dexStats,
            price: tokenPriceUsd,
            symbol: dexStats.symbol,
            name: dexStats.name,
            address: address,
            decimals: dexStats.decimals,
            chainId: chainId,
            logoURI: dexStats.logoURI,
        };
    }
}
