import type { FreshTenant } from "../installations/fresh";
import { schemaDescriptorWire, parseSchemaDescriptor } from "@bernouy/ulvia-contracts/resolution";
import { workflowContext } from "../workflows/context";
import { domainSource } from "../workflows/fixture";
import { gatewayRoute } from "./context";
import { assertCondition, requireRecord } from "../queries/types";
import type { CapabilityInventory } from "../../capabilities/types";
import type { QueryEnvironment } from "../queries/execute";
import type { PreparedSample } from "../../harness/execution/samples";

/** Measure the real control authority with an already sealed resource, not a fabricated success DTO. */
export async function prepareGatewaySchema(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    fresh: FreshTenant,
): Promise<PreparedSample> {
    try {
        const workflow = await workflowContext(inventory, environment, fresh);
        const source = await domainSource(workflow);
        const control = await workflow.gateway();
        const route = gatewayRoute(await control.checked("gateway.route.get", { contractId: "ulvia/cms.forms" }));
        const selected = requireRecord(route.selection);
        const installed = requireRecord(requireRecord(route.installation).installation);
        const admission = requireRecord(requireRecord(route.requestedRelease).admission);
        const release = requireRecord(admission.release);
        const input = {
            actor: { kind: "administrator", subjectId: workflow.fresh.session.subjectId },
            target: {
                installationId: selected.installationId,
                contractId: "ulvia/cms.forms",
                capabilityId: "forms.describe-submission",
                version: release.version,
                digest: admission.digest,
                endpoint: installed.endpoint,
                accountId: installed.accountId,
                instanceId: workflow.fresh.site.instanceId,
            },
            descriptor: source.resource,
        };
        return {
            send: async () =>
                (
                    await control.call("gateway.schemas.seal", input, (output) => {
                        assertCondition(requireRecord(output).sealed === true);
                    })
                ).observation,
            verify: async () => {
                await control.unauthorized("gateway.schemas.seal", input);
                await control.refused("gateway.schemas.seal", { ...input, actor: { kind: "anonymous" } }, [403]);
                await control.refused(
                    "gateway.schemas.seal",
                    { ...input, target: { ...input.target, instanceId: "foreign-instance" } },
                    [403],
                );
                const descriptor = parseSchemaDescriptor(source.resource);
                await control.refused(
                    "gateway.schemas.seal",
                    {
                        ...input,
                        descriptor: schemaDescriptorWire({ ...descriptor, schema: { type: "boolean" }, fields: [] }),
                    },
                    [409],
                );
                await control.refused(
                    "gateway.schemas.seal",
                    { ...input, descriptor: { ...source.resource, schemaJson: "null" } },
                    [422],
                );
                assertCondition(requireRecord(await control.checked("gateway.schemas.seal", input)).sealed === true);
            },
            close: workflow.fresh.close,
        };
    } catch (error) {
        await fresh.close();
        throw error;
    }
}
