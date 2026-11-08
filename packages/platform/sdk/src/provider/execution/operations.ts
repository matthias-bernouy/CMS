import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import type { ProviderCapabilityInvocationContext, ProviderRoute } from "@bernouy/cms-gateway/provider/server";
import type { RuntimeCapabilityPlan } from "ulvia-sdk/compiler/plan";
import type { ProviderRegistrationOptions } from "ulvia-sdk/interfaces/runtime";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { presentedHandler } from "ulvia-sdk/provider/execution/presentation";
import type { CapturedHandler, RoutingClaims } from "ulvia-sdk/provider/execution/presentation";
import { selectedRoute } from "ulvia-sdk/provider/execution/routes";

export function bindOperation<Dependencies>(
    entry: RuntimeCapabilityPlan<Dependencies>,
    handler: CapturedHandler,
    authorize: CapturedHandler | undefined,
    routes: readonly ProviderRoute[],
    options: ProviderRegistrationOptions,
    claimsFor: RoutingClaims,
    storedClaimsFor: RoutingClaims,
) {
    const guard = authorize ? presentedHandler(entry, authorize, routes, options, claimsFor) : undefined;
    const storedGuard = authorize
        ? presentedHandler(entry, authorize, routes, options, storedClaimsFor, true)
        : undefined;
    const execute = presentedHandler(entry, handler, routes, options, storedClaimsFor, true);
    return {
        invoke: async (input: Readonly<Record<string, unknown>>, context: ProviderCapabilityInvocationContext) => {
            const claims = claimsFor(context);
            const route = selectedRoute(routes, entry.contractId, entry.capability.id, context, claims);
            if (
                !context.invocation ||
                context.invocation.bindingId !== route.capability.binding.id ||
                context.invocation.contractId !== claims.contractId ||
                context.contractVersion !== claims.contractVersion
            ) {
                throw new TypeError("Durable operation requires matching receiver-selected binding evidence");
            }
            const release = entry.requests.find(
                (request) => request.contractId === claims.contractId && request.version === claims.contractVersion,
            );
            if (!release) {
                throw new TypeError("Operation does not match an exact implemented release");
            }
            if (
                entry.capability.behavior.effect === "command" &&
                entry.capability.behavior.idempotency === "keyed" &&
                !context.idempotencyKey
            ) {
                throw new TypeError("Keyed operation requires an idempotency key");
            }
            if (guard) {
                await guard(input, context);
            }
            return options.operations!.enqueue({
                providerId: options.providerId,
                siteId: context.siteId,
                instanceId: options.scope.instanceId,
                release,
                capabilityId: entry.capability.id,
                key: context.idempotencyKey,
                input: structuredClone(input),
                context,
            });
        },
        worker: async (input: Readonly<Record<string, unknown>>, context: ProviderCapabilityInvocationContext) => {
            const claims = storedClaimsFor(context);
            if (
                !entry.requests.some(
                    (request) => request.contractId === claims.contractId && request.version === claims.contractVersion,
                )
            ) {
                throw new TypeError("Operation does not match an exact implemented release");
            }
            selectedRoute(routes, entry.contractId, entry.capability.id, context, claims, true);
            context.signal?.throwIfAborted();
            validateSchemaValue(entry.capability.input, input);
            if (storedGuard) {
                await storedGuard(input, context);
            }
            context.signal?.throwIfAborted();
            const output = await execute(input, context);
            context.signal?.throwIfAborted();
            validateSchemaValue(entry.capability.output, output);
            return output;
        },
    };
}

/** The default durable worker bridge stores JSON DTOs; stream-backed operations need a complete host implementation. */
export function operationJsonSchema(schema: UlviaSchema): boolean {
    switch (schema.type) {
        case "binary":
            return false;
        case "object":
            return Object.values(schema.properties).every(operationJsonSchema);
        case "array":
            return operationJsonSchema(schema.items);
        case "map":
            return operationJsonSchema(schema.values);
        default:
            return true;
    }
}
