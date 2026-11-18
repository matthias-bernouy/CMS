import { scenarioClient } from "../../../harness/clients/session";
import { assertCondition, requireRecord } from "../../queries/types";
import { assertApprovalStateUnchanged } from "../../providers/oracles";
import type { GatewayProviderContext } from "./context";
import type { PreparedSample } from "../../../harness/execution/samples";

export async function prepareProviderDispatch(context: GatewayProviderContext): Promise<PreparedSample> {
    try {
        const capability = "gateway.provider.prepare";
        const contractId = "ulvia/cms.observability";
        const entry = {
            id: crypto.randomUUID(),
            time: new Date().toISOString(),
            level: "info",
            event: `performance.gateway.${crypto.randomUUID()}`,
            attributes: {},
        };
        const body = { entries: [entry] };
        const invocation = {
            requestId: crypto.randomUUID(),
            installationId: context.selection.installationId,
            contractId,
            contractVersion: context.selection.version,
            capabilityId: "logs.append",
            bodyBytes: Buffer.byteLength(JSON.stringify(body)),
        };
        const input = { invocation, token: context.credential.token, deadline: Date.now() + 10 * 60_000 };
        const before = await context.provider.snapshot();
        const client = scenarioClient(context.gateway.inventory, context.gateway.environment.main);
        return {
            async send() {
                let token: string | undefined;
                const prepared = await context.gateway.call(capability, input, (value) => {
                    const row = requireRecord(value);
                    assertCondition(
                        row.instanceId === context.gateway.environment.stack.instanceId &&
                            row.sourceInstallationId === context.source.id,
                        "gateway-provider-prepared-scope",
                    );
                    assertCondition(typeof row.token === "string" && row.token.length >= 20 && row.delegation === null);
                    token = row.token;
                });
                if (!prepared.observation.validated) {
                    return prepared.observation;
                }
                const invoked = await context.gateway.call(
                    "logs.append",
                    body,
                    (value) => {
                        const row = requireRecord(value);
                        assertCondition(row.accepted === 1 && row.stored === 1 && row.duplicates === 0);
                    },
                    token!,
                    contractId,
                    invocation.requestId,
                );
                const crossed = await context.gateway.call(
                    "logs.append",
                    body,
                    undefined,
                    token!,
                    contractId,
                    crypto.randomUUID(),
                );
                return invoked.observation.validated &&
                    !crossed.observation.validated &&
                    crossed.observation.status === 400
                    ? prepared.observation
                    : {
                          ...prepared.observation,
                          validated: false,
                          failure: "gateway-provider-prepared-invocation-failed",
                      };
            },
            async verify() {
                const found = await client(contractId, "logs.query", "http", { event: entry.event, limit: 10 });
                assertCondition(found.observation.validated);
                const rows = requireRecord(found.output).items;
                assertCondition(Array.isArray(rows) && rows.length === 1);
                const saved = requireRecord(rows[0]);
                const detail = await client(contractId, "logs.get", "http", { id: saved.id });
                assertCondition(detail.observation.validated);
                const durable = requireRecord(detail.output);
                assertCondition(
                    durable.service === `provider:${context.source.id}` &&
                        durable.sourceEntryId === entry.id &&
                        durable.instanceId === context.gateway.environment.stack.instanceId,
                    "gateway-provider-journal-postcondition",
                );
                await context.gateway.unauthorized(capability, input);
                await context.gateway.refused(
                    capability,
                    { ...input, invocation: { ...invocation, capabilityId: "logs.query" } },
                    [403],
                );
                await context.originalGateway.refused(capability, input, [403]);
                const original = scenarioClient(context.gateway.inventory, context.originalGateway.environment.main);
                const foreign = await original(contractId, "logs.query", "http", { event: entry.event, limit: 10 });
                const foreignItems = requireRecord(foreign.output).items;
                assertCondition(
                    foreign.observation.validated && Array.isArray(foreignItems) && foreignItems.length === 0,
                    "gateway-provider-journal-cross-instance-isolation",
                );
                assertApprovalStateUnchanged(before, await context.provider.snapshot());
            },
            close: context.close,
        };
    } catch (error) {
        await context.close();
        throw error;
    }
}
