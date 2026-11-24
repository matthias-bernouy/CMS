import {
    resolveSchema,
    parseSchemaDescriptor,
    SchemaResolutionError,
    containsResolvedSchema,
} from "@bernouy/ulvia-contracts/resolution";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import type { ProviderInvocationClaims } from "cms-gateway/protocol/ProviderInvocationToken";
import type {
    ProviderCapabilityDispatcher,
    ProviderCapabilityInvocationContext,
} from "cms-gateway/provider/server/dispatch/registry";
import { ProviderCapabilityResponse, ProviderResourceResponse } from "cms-gateway/provider/server/dispatch/responses";
import type { ProviderRoute } from "cms-gateway/provider/server/transport/routes";
import type { SchemaVersionStore } from "./interfaces";
import type { CapabilityDefinition } from "@bernouy/ulvia-contracts";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";

export function receiverSchemaResolution(
    routes: readonly ProviderRoute[],
    dispatcher: ProviderCapabilityDispatcher,
    claims: ProviderInvocationClaims,
    context: ProviderCapabilityInvocationContext,
    authorize: (claims: ProviderInvocationClaims, controlAuthority?: boolean) => Promise<boolean>,
    controlAuthority: boolean,
    versions?: SchemaVersionStore,
) {
    const seal = async (resolver: CapabilityDefinition, output: unknown, input?: Readonly<Record<string, unknown>>) => {
        if (!versions || !claims.connectionId) {
            throw new SchemaResolutionError("SCHEMA_RESOLVER_UNAVAILABLE");
        }
        const descriptor = parseSchemaDescriptor(output);
        if (input?.version !== undefined && descriptor.version !== input.version) {
            throw new SchemaResolutionError("SCHEMA_VERSION_CONFLICT");
        }
        await versions.seal(
            {
                siteId: context.siteId,
                providerId: context.providerId,
                installationId: claims.connectionId,
                instanceId: claims.instanceId,
                contractId:
                    routes.find(
                        (route) =>
                            route.contractId === claims.contractId &&
                            route.contractVersion === claims.contractVersion &&
                            route.capability.id === resolver.id,
                    )?.declaringContractId ?? claims.contractId,
                resolverId: resolver.id,
            },
            descriptor,
        );
    };
    return {
        seal,
        async validateResolverInput(capability: CapabilityDefinition, input: Readonly<Record<string, unknown>>) {
            if (capability.schemaResolver) {
                try {
                    validateSchemaValue(
                        capability.schemaResolver.selector,
                        parseStrictJson(input.selectorJson as string, 16384, 16),
                    );
                } catch (cause) {
                    throw new SchemaResolutionError("INVALID_SELECTOR", "$", { cause });
                }
            }
        },
        async schema(schema: UlviaSchema, value: unknown, input: unknown): Promise<UlviaSchema> {
            if (!containsResolvedSchema(schema)) {
                return schema;
            }
            const available = routes.filter(
                (route) => route.contractId === claims.contractId && route.contractVersion === claims.contractVersion,
            );
            const capabilities = [...new Map(available.map(({ capability }) => [capability.id, capability])).values()];

            return (
                await resolveSchema(schema, value, {
                    capabilities,
                    input,
                    seal: async () => undefined,
                    invoke: async (resolver, selector) => {
                        const route = available.find((entry) => entry.capability.id === resolver.id);
                        if (!route || !(await authorize({ ...claims, capabilityId: resolver.id }, controlAuthority))) {
                            throw new SchemaResolutionError("SCHEMA_RESOLVER_UNAVAILABLE");
                        }
                        validateSchemaValue(resolver.input, selector);
                        validateSchemaValue(
                            resolver.schemaResolver!.selector,
                            parseStrictJson(selector.selectorJson, 16384, 16),
                        );
                        const result = await dispatcher.invoke(
                            route.dispatchContractId ?? route.contractId,
                            resolver.id,
                            selector,
                            {
                                ...context,
                                idempotencyKey: undefined,
                                invocation: { ...context.invocation!, bindingId: route.capability.binding.id },
                            },
                        );
                        const response =
                            result instanceof Response
                                ? result
                                : result instanceof ProviderResourceResponse
                                  ? result.response
                                  : undefined;
                        if (response) {
                            void response.body?.cancel().catch(() => undefined);
                            throw new SchemaResolutionError("INVALID_SCHEMA_DESCRIPTOR");
                        }
                        const output = result instanceof ProviderCapabilityResponse ? result.output : result;
                        if (result instanceof ProviderCapabilityResponse && result.responseEffect) {
                            throw new TypeError("Resolvers cannot return effects");
                        }
                        await seal(resolver, output, selector);
                        return output;
                    },
                })
            ).schema;
        },
    };
}
