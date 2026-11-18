import { assertCondition, requireRecord } from "../queries/types";
import type { GatewayContext } from "./context";

/** Obtain real, narrowly scoped system authority; never mint tokens or inject system identity headers in tests. */
export async function machineInvocation(context: GatewayContext, contractId: string, capabilityId: string) {
    const { selections } = await context.readers.provider();
    const selection = selections.find((row) => row.contractId === contractId);
    const target = context.inventory.targets.find(
        (row) => !row.retained && row.release.contractId === contractId && row.definition.id === capabilityId,
    );
    assertCondition(selection && target);
    const requestId = crypto.randomUUID();
    const issued = requireRecord(
        await context.checked("gateway.invocation.issue", {
            requestId,
            installationId: selection.installationId,
            contractId,
            contractVersion: target.release.version,
            capabilityId,
            systemServiceId: contractId === "ulvia/cms.access" ? "cms-gateway" : "cms-edge",
        }),
    );
    assertCondition(typeof issued.token === "string" && issued.instanceId === context.environment.stack.instanceId);
    const token = issued.token;
    return (input: Readonly<Record<string, unknown>>, assert?: (output: unknown) => void) =>
        context.call(capabilityId, input, assert, token, contractId, requestId);
}
