import type { ContractRelease } from "@bernouy/cms-repository/contracts";
import { BunRunner } from "@bernouy/http-runner";
import { ProviderOperatorApi, UlviaProvider, type ProviderInstanceLifecycle } from "@bernouy/ulvia-provider";
import type { ProviderRuntimeEnv } from "../runtimeEnv";
import type { ProviderInstanceAuthenticator } from "./authentication/ProviderInstanceAuthenticator";
import type { ProviderInstanceHost } from "./instances/ProviderInstanceHost";

export type UlviaProviderServerHandle = Readonly<{
    stop(): Promise<void>;
}>;

/** Mounts one Provider host that resolves every request to an isolated instance runtime. */
export function mountUlviaProvider(options: {
    env: ProviderRuntimeEnv;
    contracts: readonly ContractRelease[];
    authenticator: ProviderInstanceAuthenticator;
    host: ProviderInstanceHost;
    lifecycle: ProviderInstanceLifecycle;
}): UlviaProviderServerHandle {
    const { env, contracts, authenticator, host, lifecycle } = options;
    const runner = new BunRunner({ hostname: env.ULVIA_PROVIDER_HOST });
    new ProviderOperatorApi(runner, env.ULVIA_PROVIDER_OPERATOR_TOKEN, lifecycle);
    new UlviaProvider(runner, {
        contracts,
        authenticateControlToken: async (token) => {
            const instance = await authenticator.authenticateControlToken(token);
            return instance ? host.runtime(instance) : null;
        },
        authenticateInvocationToken: async (token) => {
            const authentication = await authenticator.authenticateInvocationToken(token);
            if (!authentication) {
                return null;
            }
            return { lease: await host.runtime(authentication.instance), claims: authentication.claims };
        },
    });
    runner.start(env.ULVIA_PROVIDER_PORT);
    return { stop: () => runner.stopGracefully() };
}
