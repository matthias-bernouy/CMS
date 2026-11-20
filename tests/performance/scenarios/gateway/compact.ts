import { GatewayRouteCodec } from "@bernouy/cms-gateway/protocol";
import type { GatewayRoutePacket, GatewayContractPacket } from "@bernouy/cms-gateway/protocol";
import { capabilityToolName } from "@bernouy/cms-gateway/mcp";
import { assertCondition, requireRecord } from "../queries/types";
import { assertGatewayScope } from "./context";
import type { GatewayContext } from "./context";
import type { PreparedSample } from "../../harness/execution/samples";

/** Fresh definitions are measured; reference-only replay and refusals are additional postconditions. */
export async function prepareCompactGateway(context: GatewayContext, capability: string): Promise<PreparedSample> {
    const { selections } = await context.readers.provider();
    const contractId = context.content.release.contractId;
    const binding = context.content.definition.bindings.find((binding) => binding.transport === "mcp");
    assertCondition(binding?.transport === "mcp");
    const toolName = capabilityToolName(contractId, context.content.definition.id, binding.id, binding.tool?.name);
    const input =
        capability === "gateway.route.snapshot"
            ? { contractId, known: [] }
            : capability === "gateway.mcp.authorized"
              ? { actor: { kind: "administrator", subjectId: context.environment.main.subjectId }, toolName, known: [] }
              : { contractIds: [...new Set(selections.map((row) => row.contractId))], toolName, known: [] };
    let captured: unknown;
    const assert = (output: unknown) => {
        const packet = requireRecord(output);
        assertCondition(Array.isArray(packet.definitions) && packet.definitions.length > 0);
        if (capability === "gateway.route.snapshot") {
            assertCondition(typeof packet.snapshot === "string");
        } else {
            assertCondition(packet.found === true && typeof packet.key === "string");
        }
        captured = output;
    };
    const codec = new GatewayRouteCodec();
    const decode = async (output: unknown) => {
        const lease = codec.definitions.lease();
        try {
            if (capability === "gateway.route.snapshot") {
                const { route } = await codec.route(output as GatewayRoutePacket, lease);
                assertGatewayScope(route as unknown as Record<string, unknown>, context.environment.stack.instanceId);
                assertCondition(route.requestedRelease.admission.digest === context.content.release.digest);
            } else {
                const release = await codec.contract(output as GatewayContractPacket, lease);
                assertCondition(release?.digest === context.content.release.digest);
            }
        } finally {
            lease.release();
        }
    };
    return {
        async send() {
            return (await context.call(capability, input, assert)).observation;
        },
        async verify() {
            await decode(captured);
            await context.unauthorized(capability, input);
            const lease = codec.definitions.lease();
            let warm: unknown;
            try {
                warm = await context.checked(capability, { ...input, known: lease.known });
            } finally {
                lease.release();
            }
            assertCondition((requireRecord(warm).definitions as unknown[]).length === 0);
            await decode(warm);
            if (capability === "gateway.route.snapshot") {
                await context.refused(capability, { ...input, contractId: "performance/missing-contract" }, [404]);
            } else {
                const missing = requireRecord(
                    await context.checked(capability, { ...input, toolName: "performance_missing_tool" }),
                );
                assertCondition(missing.found === false && missing.key === "");
                if (capability === "gateway.mcp.authorized") {
                    await context.refused(
                        capability,
                        { ...input, actor: { kind: "administrator", subjectId: crypto.randomUUID() } },
                        [403],
                    );
                } else {
                    await context.refused(
                        capability,
                        { ...input, contractIds: ["performance/missing-contract"] },
                        [503],
                    );
                }
            }
            await decode(await context.checked(capability, input));
        },
    };
}
