import {
    createProviderHandler,
    compileProviderRoutes,
    DefaultProviderCapabilityDispatcher,
} from "@bernouy/cms-gateway/provider/server";
import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import type { CompiledProvider } from "ulvia-sdk/interfaces/providers";
import type { ProviderRuntime, ProviderRuntimeOptions } from "ulvia-sdk/interfaces/runtime";
import { providerPlan } from "ulvia-sdk/compiler/plan";
import { bindHandler } from "ulvia-sdk/provider/handlers";

/** Reuses the Gateway receiver; hosts supply credentials, authorization and listening. */
export function createProvider<Dependencies>(
    build: CompiledProvider<Dependencies>,
    dependencies: Dependencies,
    options: ProviderRuntimeOptions,
): ProviderRuntime {
    const plan = providerPlan(build);
    const scope = Object.freeze({ ...options.scope });
    if (!scope.siteId || !scope.instanceId || typeof options.authorize !== "function") {
        throw new TypeError("Provider scope and explicit authorization policy are required");
    }
    if (
        plan.some(
            ({ capability }) => capability.behavior.effect === "command" && capability.behavior.idempotency === "keyed",
        ) &&
        !options.executeKeyed
    ) {
        throw new TypeError("Keyed commands require a host-owned durable executeKeyed adapter");
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
    const routes = compileProviderRoutes(build.implementedContracts);
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const groups = new Map<string, (typeof plan)[number][]>();
    for (const entry of plan) {
        const key = `${entry.contractId}\0${entry.capability.id}`;
        const group = groups.get(key) ?? [];
        group.push(entry);
        groups.set(key, group);
    }
    for (const entries of groups.values()) {
        const handlers = entries.map((entry) => ({
            entry,
            invoke: bindHandler(
                entry,
                dependencies,
                routes,
                claimsFor,
                runtimeOptions,
                build.manifest.manifest.providerId,
            ),
        }));
        dispatcher.register(entries[0]!.contractId, entries[0]!.capability.id, async (input, context) => {
            const claims = claimsFor(context);
            const selected = handlers.filter(({ entry }) =>
                entry.requests.some(
                    (request) => request.contractId === claims.contractId && request.version === claims.contractVersion,
                ),
            );
            if (selected.length !== 1) {
                throw new TypeError("Invocation does not resolve to one exact implemented release");
            }
            return selected[0]!.invoke(input, context);
        });
    }
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
