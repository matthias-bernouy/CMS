import { GatewayRouteCodec } from "@bernouy/cms-gateway/protocol";
import type { GatewayRoutePacket, GatewayContractPacket } from "@bernouy/cms-gateway/protocol";
import { capabilityToolName } from "@bernouy/cms-gateway/mcp";
import { readProviderCredential } from "../../../../../integration/instance/providers/credentials";
import { gatewayContext } from "../../../gateway/context";
import { metadataFixtureScope } from "../state/scope";
import { assertCondition, requireRecord } from "../../../queries/types";
import type { MetadataContext } from "../state/context";
import type { CapabilityInventory, Variant } from "../../../../capabilities/types";
import type { PreparedSample } from "../../../../harness/execution/samples";

/** Exercise real catalogue history/size and selection changes with the existing owned metadata corpus. */
export async function prepareCompactMetadata(
    inventory: CapabilityInventory,
    state: MetadataContext,
    capability: string,
    variant: Variant,
): Promise<PreparedSample> {
    const key = metadataFixtureScope(state.environment.stack, state.tenant.site, state.environment.main.origin);
    const credentials = await readProviderCredential(
        state.environment.stack.providerName,
        key,
        undefined,
        state.tenant.site.instanceId,
    );
    assertCondition(typeof credentials.controlToken === "string");
    const gateway = await gatewayContext(inventory, {
        ...state.environment,
        main: state.tenant.session,
        stack: {
            ...state.environment.stack,
            instanceId: state.tenant.site.instanceId,
            providerControl: {
                origin: state.environment.stack.providerControl!.origin,
                token: credentials.controlToken,
            },
        },
    });
    await state.refreshSelectedObservation();
    const codec = new GatewayRouteCodec();
    const tool = gateway.content.definition.bindings.find((binding) => binding.transport === "mcp");
    assertCondition(tool?.transport === "mcp");
    const selectedIds = () => {
        const selections = state.connections.selections;
        assertCondition(Array.isArray(selections));
        return selections.map((pin) => {
            const id = requireRecord(pin).contractId;
            assertCondition(typeof id === "string");
            return id;
        });
    };
    const input = () =>
        capability === "gateway.route.snapshot"
            ? { contractId: state.resources.latestContract().id, known: [] as readonly string[] }
            : {
                  contractIds: selectedIds(),
                  toolName: capabilityToolName(
                      gateway.content.release.contractId,
                      gateway.content.definition.id,
                      tool.id,
                      tool.tool?.name,
                  ),
                  known: [] as readonly string[],
              };
    const decode = async (output: unknown) => {
        const lease = codec.definitions.lease();
        try {
            if (capability === "gateway.route.snapshot") {
                const { route } = await codec.route(output as GatewayRoutePacket, lease);
                const resource = state.resources.latestContract();
                const connection = state.connections.rows.get(0)!;
                assertCondition(
                    route.requestedRelease.admission.digest === resource.digest &&
                        route.selection.digest === resource.digest,
                );
                assertCondition(
                    route.selection.installationId === connection.id &&
                        route.installation.revision === connection.revision,
                );
                assertCondition(route.installation.observation?.report.instanceId === connection.instanceId);
            } else {
                const contract = await codec.contract(output as GatewayContractPacket, lease);
                assertCondition(contract?.digest === gateway.content.release.digest);
            }
        } finally {
            lease.release();
        }
    };
    await decode(await gateway.checked(capability, input()));
    if (variant === "invalidation") {
        await state.mutateDocumentation();
        await state.refreshSelectedObservation();
    }
    const advertised = codec.definitions.lease();
    const request = { ...input(), known: advertised.known };
    let captured: unknown;
    return {
        async send() {
            return (
                await gateway.call(capability, request, (output) => {
                    captured = output;
                })
            ).observation;
        },
        async verify() {
            await decode(captured);
            await gateway.unauthorized(capability, request);
            await decode(await gateway.checked(capability, input()));
        },
        async close() {
            advertised.release();
        },
    };
}
