// actions/index.ts

import { swapAction } from './swap'
import { transferAction } from './transfer'
import { WalletProvider } from '../providers/walletProvider'
import { TokenRegistry } from '../adapters/tokenRegistry'
import { NetworkRegistry } from '../adapters/networkRegistry'

export function createActions(walletProvider: WalletProvider, tokenRegistry: TokenRegistry, networkRegistry: NetworkRegistry) {
    return {
        swap: swapAction(walletProvider, tokenRegistry, networkRegistry),
        transfer: new transferAction(walletProvider, tokenRegistry, networkRegistry)
    }
}

export type Actions = ReturnType<typeof createActions>
