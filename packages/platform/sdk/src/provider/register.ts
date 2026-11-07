import { compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import type {
    ProviderCapabilityRegistry,
    ProviderCapabilityInvocationContext,
} from "@bernouy/cms-gateway/provider/server";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import type { CompiledImplementations } from "ulvia-sdk/interfaces/providers";
import type { ProviderRegistrationOptions } from "ulvia-sdk/interfaces/runtime";
import { providerPlan } from "ulvia-sdk/compiler/plan";
import { bindHandler } from "ulvia-sdk/provider/handlers";

type RoutingClaims = Pick<ProviderInvocationClaims, "contractId" | "contractVersion">;

/** Mounts SDK implementations in a host registry; the host must authenticate and authorize first. */
export function registerProviderHandlers<Dependencies>(
    build: CompiledImplementations<Dependencies>,
    dispatcher: ProviderCapabilityRegistry,
    dependencies: Dependencies,
    options: ProviderRegistrationOptions,
    verifiedClaims?: (context: ProviderCapabilityInvocationContext) => RoutingClaims,
): void {
    const plan = providerPlan(build);
    const snapshot = Object.freeze({ ...options, scope: Object.freeze({ ...options.scope }) });
    if (!snapshot.providerId || !snapshot.scope.siteId || !snapshot.scope.instanceId) {
        throw new TypeError("Exact Provider registration scope is required");
    }
    if (
        plan.some(
            ({ capability }) => capability.behavior.effect === "command" && capability.behavior.idempotency === "keyed",
        ) &&
        !snapshot.executeKeyed
    ) {
        throw new TypeError("Keyed commands require a host-owned durable executeKeyed adapter");
    }
    const claimsFor = (context: ProviderCapabilityInvocationContext): RoutingClaims => {
        if (
            context.siteId !== snapshot.scope.siteId ||
            context.providerId !== snapshot.providerId ||
            context.invocation?.instanceId !== snapshot.scope.instanceId
        ) {
            throw new TypeError("Invocation does not match the mounted Provider scope");
        }
        return verifiedClaims
            ? verifiedClaims(context)
            : {
                  contractId: context.invocation.contractId,
                  contractVersion: context.contractVersion,
              };
    };
    const routes = compileProviderRoutes(build.implementedContracts);
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
            invoke: bindHandler(entry, dependencies, routes, claimsFor, snapshot, snapshot.providerId),
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
}
