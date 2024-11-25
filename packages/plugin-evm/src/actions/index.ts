// actions/index.ts

import { SwapAction } from './swap'
import { TransferAction } from './transfer'
import { WalletProvider } from '../providers/walletProvider'
import { TokenRegistry } from '../adapters/tokenRegistry'
import { NetworkRegistry } from '../adapters/networkRegistry'

export function createActions(walletProvider: WalletProvider, tokenRegistry: TokenRegistry, networkRegistry: NetworkRegistry) {
    return {
        swap: new SwapAction(walletProvider, tokenRegistry, networkRegistry),
        transfer: new TransferAction(walletProvider, tokenRegistry, networkRegistry)
    }
}

export type Actions = ReturnType<typeof createActions>
