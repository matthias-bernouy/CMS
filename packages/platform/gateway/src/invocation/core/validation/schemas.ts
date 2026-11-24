import type { SchemaDescriptor } from "@bernouy/ulvia-contracts/schema";
import { resolverRoutes } from "./resolverRoutes";
import type { SchemaResolverRoutes } from "./resolverRoutes";
import {
    resolveSchema,
    parseSchemaDescriptor,
    containsResolvedSchema,
    SchemaResolutionError,
} from "@bernouy/ulvia-contracts/resolution";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import type { CapabilityDefinition, ContractRelease } from "@bernouy/ulvia-contracts";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import type { GatewayInvocation, GatewayResult } from "../../interfaces/Invocation";
import { GatewayError } from "../GatewayError";

/** Resolver calls retain the actor and ordinary Gateway authorization and transport fences. */
export async function resolveInvocationSchema(
    schema: UlviaSchema,
    value: unknown,
    input: unknown,
    release: ContractRelease,
    invocation: GatewayInvocation,
    invoke: (value: GatewayInvocation) => Promise<GatewayResult>,
    scope: SchemaResolverRoutes,
): Promise<UlviaSchema> {
    if (!containsResolvedSchema(schema)) {
        return schema;
    }
    const resolved = await resolverRoutes(schema, release, scope);
    return (
        await resolveSchema(schema, value, {
            capabilities: resolved.capabilities,
            input,
            // The nested Gateway invocation seals each descriptor through the CMS authority before returning it.
            seal: async () => undefined,
            invoke: async (resolver, selector) => {
                const result = await invoke({
                    ...invocation,
                    capabilityId: resolver.id,
                    contractId: resolved.targets.get(resolver.id)!.contractId,
                    expectedTarget: {
                        installationId: scope.route.selection.installationId,
                        endpoint: scope.route.installation.installation.endpoint,
                        accountId: scope.route.installation.installation.accountId,
                        instanceId: scope.route.installation.observation!.report.instanceId,
                        version: resolved.targets.get(resolver.id)!.version,
                        digest: resolved.targets.get(resolver.id)!.digest,
                    },
                    input: selector,
                    bindingId: undefined,
                    bindingTransport: undefined,
                    binaryBody: undefined,
                    metadataOnly: undefined,
                    idempotencyKey: undefined,
                    actorCredential: undefined,
                });
                if (result.kind === "declared-error" && result.errorCode === "SCHEMA_VERSION_CONFLICT") {
                    throw new SchemaResolutionError("SCHEMA_VERSION_CONFLICT");
                }
                if (result.kind !== "success") {
                    throw new GatewayError("invalid_input", "Schema resolver did not return a descriptor");
                }
                return result.output;
            },
        })
    ).schema;
}
export function validateResolverResult(
    capability: CapabilityDefinition,
    input: Readonly<Record<string, unknown>>,
    output: unknown,
): SchemaDescriptor | undefined {
    if (!capability.schemaResolver) {
        return;
    }
    const descriptor = parseSchemaDescriptor(output);
    if (input.version !== undefined && descriptor.version !== input.version) {
        throw new GatewayError("invalid_provider_response", "Schema resolver returned another version");
    }
    validateSchemaValue(capability.output, output);
    return descriptor;
}
