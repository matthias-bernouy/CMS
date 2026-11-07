import { NOOP_LOGGER, type Logger } from "@bernouy/logging";
import type { ResolvedContract } from "@bernouy/ulvia-contracts";
import type { ProviderInvocationClaims } from "cms-gateway/protocol/ProviderInvocationToken";
import type { ProviderCapabilityRegistry } from "./dispatch/registry";
import { compileProviderRoutes } from "./transport/routes";
import { createProviderContractRelay } from "./transport/relay";

export interface ProviderHandlerOptions {
    readonly contracts: readonly ResolvedContract[];
    readonly dispatcher: ProviderCapabilityRegistry;
    readonly logger?: Logger;
    /** Verify credentials, signed audience and exact release before returning host-owned scope. */
    authenticate(request: Request): Promise<{
        readonly claims: ProviderInvocationClaims;
        readonly siteId: string;
        readonly providerId: string;
    } | null>;
    authorize?(claims: ProviderInvocationClaims): Promise<boolean>;
}
/** Fetch-compatible HTTP receiver for any admitted contract namespace. The host owns listening and authentication. */
export function createProviderHandler(options: ProviderHandlerOptions): (request: Request) => Promise<Response> {
    const routes = compileProviderRoutes(options.contracts);
    options.dispatcher.seal(options.contracts);
    return async (request) => {
        const verified = await options.authenticate(request);
        if (!verified) {
            return new Response(null, { status: 401, headers: { "cache-control": "no-store" } });
        }
        const relay = createProviderContractRelay(
            routes,
            options.dispatcher,
            verified,
            options.logger ?? NOOP_LOGGER,
            options.authorize,
        );
        return (await relay(request, verified.claims)) ?? new Response(null, { status: 404 });
    };
}
