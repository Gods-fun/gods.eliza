
import { IAgentRuntime } from '@ai16z/eliza'
import { swapAction } from './actions/swap'
import { transferAction } from './actions/transfer'
import { bridgeAction } from './actions/bridge'
import { WalletProvider } from './providers/wallet'
import { TokenProvider } from './providers/token'
import { NetworkProvider } from './providers/networkProvider'
import { SwapService } from './services/swapService'
import { TransferService } from './services/transferService'
import { BridgeService } from './services/bridgeService'
import { SwapEvaluator } from './evaluators/swapEvaluator'
import { TransferEvaluator } from './evaluators/transferEvaluator'
import { BridgeEvaluator } from './evaluators/bridgeEvaluator'

export const actions = {
    swap: swapAction,
    transfer: transferAction,
    bridge: bridgeAction,
}


export function createProviders(runtime: IAgentRuntime) {
    return {
        wallet: new WalletProvider(runtime),
        token: new TokenProvider(runtime),
        network: new NetworkProvider(runtime),
    }
}

export function createServices(providers: ReturnType<typeof createProviders>) {
    return {
        swap: new SwapService(providers),
        transfer: new TransferService(providers),
        bridge: new BridgeService(providers),
    }
}

export function createEvaluators(services: ReturnType<typeof createServices>) {
    return {
        swap: new SwapEvaluator(services.swap),
        transfer: new TransferEvaluator(services.transfer),
        bridge: new BridgeEvaluator(services.bridge),
    }
}

export function createDeFiAgent(runtime: IAgentRuntime) {
    const providers = createProviders(runtime)
    const services = createServices(providers)
    const evaluators = createEvaluators(services)

    return {
        actions,
        providers,
        services,
        evaluators,
    }
}

export type DeFiAgent = ReturnType<typeof createDeFiAgent>
