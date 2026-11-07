import { createProviderHandler, DefaultProviderCapabilityDispatcher } from "@bernouy/cms-gateway/provider/server";
import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import type { CompiledProvider } from "ulvia-sdk/interfaces/providers";
import type { ProviderRuntime, ProviderRuntimeOptions } from "ulvia-sdk/interfaces/runtime";
import { registerProviderHandlers } from "ulvia-sdk/provider/register";

/** Reuses the Gateway receiver; hosts supply credentials, authorization and listening. */
export function createProvider<Dependencies>(
    build: CompiledProvider<Dependencies>,
    dependencies: Dependencies,
    options: ProviderRuntimeOptions,
): ProviderRuntime {
    const scope = Object.freeze({ ...options.scope });
    if (!scope.siteId || !scope.instanceId || typeof options.authorize !== "function") {
        throw new TypeError("Provider scope and explicit authorization policy are required");
    }
    const verifiedRequests = new WeakMap<Request, ProviderInvocationClaims>();
    const claimsFor = (context: ProviderCapabilityInvocationContext) => {
        const request = context.http?.transportRequest;
        const claims = request ? verifiedRequests.get(request) : undefined;
        if (!claims) {
            throw new TypeError("Invocation has no verified Provider request scope");
        }
        return claims;
    };
    const runtimeOptions = Object.freeze({ ...options, scope });
    const { authenticate, authorize, logger } = runtimeOptions;
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerProviderHandlers(
        build,
        dispatcher,
        dependencies,
        {
            ...runtimeOptions,
            providerId: build.manifest.manifest.providerId,
        },
        claimsFor,
    );
    const fetch = createProviderHandler({
        contracts: build.implementedContracts,
        dispatcher,
        ...(logger ? { logger } : {}),
        authorize,
        authenticate: async (request) => {
            try {
                const verified = await authenticate(request);
                if (
                    !verified ||
                    verified.siteId !== scope.siteId ||
                    verified.providerId !== build.manifest.manifest.providerId ||
                    verified.claims.instanceId !== scope.instanceId
                ) {
                    return null;
                }
                verifiedRequests.set(request, verified.claims);
                return verified;
            } catch {
                return null;
            }
        },
    });
    return Object.freeze({ manifest: build.manifest, contracts: build.implementedContracts, fetch });
}
