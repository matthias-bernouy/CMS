import { resolveContract } from "@bernouy/ulvia-contracts";
import { resolveSchema, SchemaResolutionError } from "@bernouy/ulvia-contracts/resolution";
import type { WorkflowContracts } from "@bernouy/workflows";
import { WorkflowError } from "@bernouy/workflows";
import type { createProviderGateway } from "../../gateway/createProviderGateway";
import type { ProviderStores } from "../../stores/providerStores";
export function workflowSchemaResolver(
    gateway: Awaited<ReturnType<typeof createProviderGateway>>,
    stores: ProviderStores,
): NonNullable<WorkflowContracts["resolveSchema"]> {
    return async (contractId, schema, value, input) => {
        const route = await gateway.routes.resolve(gateway.siteId, contractId);
        if (!route || !(await gateway.routes.isCurrent(route))) {
            throw new WorkflowError("CORE_UNAVAILABLE");
        }
        const release = await resolveContract(stores.releases, route.requestedRelease.admission);
        return resolveSchema(schema, value, {
            input,
            capabilities: release.capabilities.map(({ definition }) => definition),
            seal: async () => undefined,
            invoke: async (resolver, selector) => {
                const owner = release.capabilities.find(({ definition }) => definition.id === resolver.id)!.owner;
                const result = await gateway.invoker.invoke({
                    siteId: gateway.siteId,
                    contractId: owner.contractId,
                    capabilityId: resolver.id,
                    input: selector,
                    actor: { kind: "system", serviceId: "cms-workflows-schema" },
                    expectedTarget: {
                        installationId: route.selection.installationId,
                        endpoint: route.installation.installation.endpoint,
                        accountId: route.installation.installation.accountId,
                        instanceId: route.installation.observation!.report.instanceId,
                        version: owner.version,
                        digest: owner.digest,
                    },
                });
                if (result.kind === "declared-error" && result.errorCode === "SCHEMA_VERSION_CONFLICT") {
                    throw new SchemaResolutionError("SCHEMA_VERSION_CONFLICT");
                }
                if (result.kind !== "success") {
                    throw new SchemaResolutionError("SCHEMA_RESOLVER_UNAVAILABLE");
                }
                return result.output;
            },
        });
    };
}
