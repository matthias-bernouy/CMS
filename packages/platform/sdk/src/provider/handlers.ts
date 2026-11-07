import { ProviderCapabilityDispatchError } from "@bernouy/cms-gateway/provider/server";
import type {
    ProviderCapabilityHandler,
    ProviderCapabilityInvocationContext,
    ProviderRoute,
} from "@bernouy/cms-gateway/provider/server";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import type { ProviderRegistrationOptions } from "ulvia-sdk/interfaces/runtime";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import type { RuntimeCapabilityPlan } from "ulvia-sdk/compiler/plan";
import { OperationFailure } from "ulvia-sdk/definitions/errors";
import { binaryInputLease, boundBinaryResponse } from "ulvia-sdk/provider/binary";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

function selectedRoute(
    routes: readonly ProviderRoute[],
    contractId: string,
    capabilityId: string,
    context: ProviderCapabilityInvocationContext,
    claims: Pick<ProviderInvocationClaims, "contractId" | "contractVersion">,
) {
    const request = context.http?.transportRequest;
    if (!request) {
        throw new TypeError("Provider handler requires its trusted HTTP request context");
    }
    const path = new URL(request.url).pathname;
    const selected = routes.find(
        (route) =>
            (route.dispatchContractId ?? route.contractId) === contractId &&
            route.contractId === claims.contractId &&
            route.contractVersion === claims.contractVersion &&
            route.capability.id === capabilityId &&
            route.match(request.method, path),
    );
    if (!selected) {
        throw new TypeError("No admitted binding matches this invocation");
    }
    return selected;
}

export function bindHandler<Dependencies>(
    entry: RuntimeCapabilityPlan<Dependencies>,
    dependencies: Dependencies,
    routes: readonly ProviderRoute[],
    claimsFor: (
        context: ProviderCapabilityInvocationContext,
    ) => Pick<ProviderInvocationClaims, "contractId" | "contractVersion">,
    options: ProviderRegistrationOptions,
    providerId: string,
): ProviderCapabilityHandler {
    const created = entry.createHandler(dependencies);
    if (typeof created !== "function") {
        throw new SdkDefinitionError(`Handler factory did not return a function for ${entry.capability.id}`);
    }
    const handler = created as (
        input: Readonly<Record<string, unknown>>,
        context: ProviderCapabilityInvocationContext,
    ) => unknown;
    return async (input, context) => {
        const lease = binaryInputLease(entry.capability, context);
        try {
            const invoke = async () => {
                try {
                    return await handler(input, lease.context);
                } catch (error) {
                    if (!(error instanceof OperationFailure) || error.operation !== entry.operation) {
                        throw error;
                    }
                    const declaration = entry.capability.errors.find((candidate) => candidate.code === error.code);
                    if (!declaration) {
                        throw new TypeError("Handler threw an undeclared operation error");
                    }
                    if (declaration.output) {
                        validateSchemaValue(declaration.output, error.output);
                    } else if (error.output !== undefined) {
                        throw new TypeError("Undeclared operation error payload");
                    }
                    const route = selectedRoute(
                        routes,
                        entry.contractId,
                        entry.capability.id,
                        context,
                        claimsFor(context),
                    );
                    const status = route.capability.binding.response.errorStatuses[error.code];
                    if (status === undefined) {
                        throw new TypeError("Operation error has no admitted HTTP status");
                    }
                    throw new ProviderCapabilityDispatchError(error.code, status, error.code, {}, error.output);
                }
            };
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
                          invoke,
                      )
                    : await invoke();
            if (entry.capability.behavior.execution === "operation" || entry.capability.output.type !== "binary") {
                return output;
            }
            const route = selectedRoute(routes, entry.contractId, entry.capability.id, context, claimsFor(context));
            const response = output instanceof Uint8Array ? bytesResponse(output, entry, route) : output;
            if (!(response instanceof Response)) {
                throw new TypeError("Binary handler must return bytes or a Response");
            }
            return boundBinaryResponse(
                response,
                entry.capability.output.maxBytes,
                route.capability.binding.response.successStatuses,
                context.signal,
            );
        } finally {
            lease.close();
        }
    };
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
