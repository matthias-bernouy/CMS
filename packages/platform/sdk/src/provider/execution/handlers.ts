import { selectedRoute } from "ulvia-sdk/provider/execution/routes";
import { bindOperation } from "ulvia-sdk/provider/execution/operations";
import { presentedHandler } from "ulvia-sdk/provider/execution/presentation";
import type { RoutingClaims } from "ulvia-sdk/provider/execution/presentation";
import { ProviderResourceResponse, resourceResponse } from "@bernouy/cms-gateway/provider/responses";
import { handlerAuthorization } from "ulvia-sdk/definitions/execution/authorization";
import type {
    ProviderCapabilityHandler,
    ProviderCapabilityInvocationContext,
    ProviderRoute,
} from "@bernouy/cms-gateway/provider/server";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import type { ProviderRegistrationOptions } from "ulvia-sdk/interfaces/runtime";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import type { RuntimeCapabilityPlan } from "ulvia-sdk/compiler/plan";
import { binaryInputLease, boundBinaryResponse } from "ulvia-sdk/provider/execution/binary";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

export function bindHandler<Dependencies>(
    entry: RuntimeCapabilityPlan<Dependencies>,
    dependencies: Dependencies,
    routes: readonly ProviderRoute[],
    claimsFor: (
        context: ProviderCapabilityInvocationContext,
    ) => Pick<ProviderInvocationClaims, "contractId" | "contractVersion">,
    options: ProviderRegistrationOptions,
    providerId: string,
    storedClaimsFor: RoutingClaims,
) {
    const created = entry.createHandler(dependencies);
    if (typeof created !== "function") {
        throw new SdkDefinitionError(`Handler factory did not return a function for ${entry.capability.id}`);
    }
    const handler = created as (
        input: Readonly<Record<string, unknown>>,
        context: ProviderCapabilityInvocationContext,
    ) => unknown;
    const authorize = handlerAuthorization(handler);
    if (entry.defaultOperation) {
        return bindOperation(entry, handler, authorize, routes, options, claimsFor, storedClaimsFor);
    }
    const execute = presentedHandler(entry, handler, routes, options, claimsFor);
    const guard = authorize ? presentedHandler(entry, authorize, routes, options, claimsFor) : undefined;
    const invoke: ProviderCapabilityHandler = async (input, context) => {
        const lease = binaryInputLease(entry.capability, context);
        try {
            const run = () => execute(input, lease.context);
            if (guard) {
                await guard(input, lease.context);
            }
            const behavior = entry.capability.behavior;
            const output =
                behavior.effect === "command" && behavior.idempotency === "keyed"
                    ? await options.executeKeyed!(
                          {
                              providerId,
                              instanceId: options.scope.instanceId,
                              siteId: context.siteId,
                              contractId: entry.contractId,
                              version: entry.version,
                              capabilityId: entry.capability.id,
                              key: context.idempotencyKey!,
                              input: structuredClone(input),
                              context: lease.context,
                          },
                          run,
                      )
                    : await run();
            if (entry.capability.behavior.execution === "operation" || entry.capability.output.type !== "binary") {
                return output;
            }
            const route = selectedRoute(routes, entry.contractId, entry.capability.id, context, claimsFor(context));
            const resource = output instanceof ProviderResourceResponse ? output : undefined;
            if (resource && !entry.capability.output.resource) {
                await resource.response.body?.cancel().catch(() => undefined);
                throw new TypeError("Resource metadata requires an admitted resource capability");
            }
            const response =
                resource?.response ?? (output instanceof Uint8Array ? bytesResponse(output, entry, route) : output);
            if (!(response instanceof Response)) {
                throw new TypeError("Binary handler must return bytes or a Response");
            }
            const bounded = boundBinaryResponse(
                response,
                entry.capability.output.maxBytes,
                entry.capability.output.resource
                    ? [response.status]
                    : route.capability.binding.response.successStatuses,
                context.signal,
            );
            return resource ? resourceResponse(bounded, resource.metadata) : bounded;
        } finally {
            lease.close();
        }
    };
    return { invoke };
}

function bytesResponse<Dependencies>(
    bytes: Uint8Array,
    entry: RuntimeCapabilityPlan<Dependencies>,
    route: ProviderRoute,
): Response {
    validateSchemaValue(entry.capability.output, bytes);
    const types = route.capability.binding.response.contentTypes;
    if (types.length !== 1) {
        throw new TypeError("Return a Response when binary content type cannot be inferred uniquely");
    }
    return new Response(new Uint8Array(bytes), {
        status: route.capability.binding.response.successStatuses[0],
        headers: { "content-type": types[0]!, "content-length": String(bytes.byteLength) },
    });
}
