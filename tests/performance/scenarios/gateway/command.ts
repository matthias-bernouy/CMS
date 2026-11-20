import { assertCondition, requireRecord } from "../queries/types";
import { TEST_SITE_ID } from "../../fixtures/scope";
import type { PreparedSample } from "../../harness/execution/samples";
import type { GatewayContext } from "./context";

/** Issue a real command token, then prove the receiver refuses a stale revision without changing site data. */
export async function prepareGatewayCommand(context: GatewayContext): Promise<PreparedSample> {
    const { entry } = await context.readers.provider();
    const businessInput = { expectedRevision: 999999999, visible: false };
    const invocation = {
        requestId: crypto.randomUUID(),
        installationId: entry.id,
        contractId: context.content.release.contractId,
        contractVersion: context.content.release.version,
        capabilityId: "site.update",
        bodyBytes: new TextEncoder().encode(JSON.stringify(businessInput)).byteLength,
    };
    const event = {
        id: crypto.randomUUID(),
        requestId: invocation.requestId,
        occurredAt: new Date().toISOString(),
        siteId: TEST_SITE_ID,
        installationId: entry.id,
        contractId: invocation.contractId,
        capabilityId: invocation.capabilityId,
        actorKind: "administrator",
        actorSubjectId: context.environment.main.subjectId,
        stage: "started",
    };
    const input = {
        invocation,
        actor: { kind: "administrator", subjectId: context.environment.main.subjectId },
        deadline: Date.now() + 10 * 60_000,
        commandStart: { providerId: entry.providerId, identityRequired: true, event: JSON.stringify(event) },
    };
    let prepared: Readonly<Record<string, unknown>> | undefined;
    return {
        async send() {
            const result = await context.call("gateway.command.prepare", input, (output) => {
                const packet = requireRecord(output);
                assertCondition(packet.failure === null);
                prepared = requireRecord(packet.prepared);
                assertCondition(prepared.instanceId === context.environment.stack.instanceId);
                assertCondition(typeof prepared.token === "string" && prepared.token.length >= 20);
            });
            if (!result.observation.validated || !prepared) {
                return result.observation;
            }
            const refused = await context.call(
                "site.update",
                businessInput,
                undefined,
                String(prepared.token),
                invocation.contractId,
                invocation.requestId,
            );
            const crossed = await context.call(
                "site.update",
                businessInput,
                undefined,
                String(prepared.token),
                invocation.contractId,
                crypto.randomUUID(),
            );
            await context.checked("gateway.audit.append", {
                event: JSON.stringify({
                    ...event,
                    id: crypto.randomUUID(),
                    occurredAt: new Date().toISOString(),
                    stage: "declared-error",
                    status: 409,
                    errorCode: "REVISION_CONFLICT",
                }),
            });
            return refused.observation.status === 409 && crossed.observation.status === 400
                ? result.observation
                : { ...result.observation, validated: false, failure: "command-token-postcondition-failed" };
        },
        async verify() {
            await context.unauthorized("gateway.command.prepare", input);
            await context.refused(
                "gateway.command.prepare",
                {
                    ...input,
                    commandStart: {
                        ...input.commandStart,
                        event: JSON.stringify({ ...event, siteId: "another-instance" }),
                    },
                },
                [403],
            );
        },
        async close() {
            if (prepared?.delegation) {
                const root = requireRecord(prepared.delegation);
                await context.checked("gateway.delegation.close", {
                    context: { siteId: TEST_SITE_ID, ticket: root.ticket, requestId: invocation.requestId },
                });
            }
        },
    };
}
