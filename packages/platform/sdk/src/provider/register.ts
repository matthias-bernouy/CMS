import { operationJsonSchema } from "ulvia-sdk/provider/execution/operations";
import { operationRegistrations } from "ulvia-sdk/provider/execution/registrations";
import { compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import type {
    ProviderCapabilityRegistry,
    ProviderCapabilityInvocationContext,
} from "@bernouy/cms-gateway/provider/server";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import type { CompiledImplementations } from "ulvia-sdk/interfaces/providers";
import type { ProviderRegistrationOptions } from "ulvia-sdk/interfaces/runtime";
import { selectImplementations } from "ulvia-sdk/provider/selection";
import { bindHandler } from "ulvia-sdk/provider/execution/handlers";

type RoutingClaims = Pick<ProviderInvocationClaims, "contractId" | "contractVersion">;

/** Mounts SDK implementations in a host registry; the host must authenticate and authorize first. */
export function registerProviderHandlers<Dependencies>(
    build: CompiledImplementations<Dependencies>,
    dispatcher: ProviderCapabilityRegistry,
    dependencies: Dependencies,
    options: ProviderRegistrationOptions,
    verifiedClaims?: (context: ProviderCapabilityInvocationContext) => RoutingClaims,
): void {
    const { plan, contracts } = selectImplementations(build, options.implementations);
    const adapter = options.operations;
    if (adapter && (typeof adapter.register !== "function" || typeof adapter.enqueue !== "function")) {
        throw new TypeError("Invalid durable operation adapter");
    }
    const snapshot = Object.freeze({
        ...options,
        scope: Object.freeze({ ...options.scope }),
        ...(adapter
            ? {
                  operations: Object.freeze({
                      register: adapter.register.bind(adapter),
                      enqueue: adapter.enqueue.bind(adapter),
                  }),
              }
            : {}),
    });
    if (!snapshot.providerId || !snapshot.scope.siteId || !snapshot.scope.instanceId) {
        throw new TypeError("Exact Provider registration scope is required");
    }
    if (
        plan.some(
            ({ capability, defaultOperation }) =>
                !defaultOperation &&
                capability.behavior.effect === "command" &&
                capability.behavior.idempotency === "keyed",
        ) &&
        !snapshot.executeKeyed
    ) {
        throw new TypeError("Keyed commands require a host-owned durable executeKeyed adapter");
    }
    if (plan.some((entry) => entry.defaultOperation) && !snapshot.operations) {
        throw new TypeError("Default operations require a host-owned durable operation adapter");
    }
    for (const entry of plan.filter((entry) => entry.defaultOperation)) {
        if (!operationJsonSchema(entry.capability.input) || !operationJsonSchema(entry.capability.output)) {
            throw new TypeError("Default durable operations require JSON input and terminal output");
        }
        if (!entry.capability.bindings.some((binding) => binding.transport === "http")) {
            throw new TypeError("Default operations require an executable HTTP binding");
        }
    }
    const storedClaimsFor = (context: ProviderCapabilityInvocationContext): RoutingClaims => {
        if (
            context.siteId !== snapshot.scope.siteId ||
            context.providerId !== snapshot.providerId ||
            context.invocation?.instanceId !== snapshot.scope.instanceId
        ) {
            throw new TypeError("Invocation does not match the mounted Provider scope");
        }
        return { contractId: context.invocation.contractId, contractVersion: context.contractVersion };
    };
    const claimsFor = (context: ProviderCapabilityInvocationContext): RoutingClaims => {
        const recorded = storedClaimsFor(context);
        return verifiedClaims ? verifiedClaims(context) : recorded;
    };
    const routes = compileProviderRoutes(contracts);
    const groups = new Map<string, (typeof plan)[number][]>();
    for (const entry of plan) {
        const key = `${entry.contractId}\0${entry.capability.id}`;
        const group = groups.get(key) ?? [];
        group.push(entry);
        groups.set(key, group);
    }
    const prepared = [...groups.values()].map((entries) => ({
        entries,
        handlers: entries.map((entry) => ({
            entry,
            ...bindHandler(entry, dependencies, routes, claimsFor, snapshot, snapshot.providerId, storedClaimsFor),
        })),
    }));
    const registrations = operationRegistrations(
        prepared.flatMap(({ handlers }) => handlers),
        routes,
    );
    for (const registration of registrations) {
        snapshot.operations!.register(registration);
    }
    for (const { entries, handlers } of prepared) {
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
