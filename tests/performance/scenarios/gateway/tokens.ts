import { assertCondition, requireRecord } from "../queries/types";
import { TEST_SITE_ID } from "../../fixtures/scope";
import type { PreparedSample } from "../../harness/execution/samples";
import type { GatewayContext } from "./context";

export async function prepareGatewayToken(context: GatewayContext, capability: string): Promise<PreparedSample> {
    const { entry } = await context.readers.provider();
    const alias = requireRecord(
        await context.checked("gateway.identity.resolve", {
            providerId: entry.providerId,
            subjectId: context.environment.main.subjectId,
        }),
    ).providerSubjectId;
    assertCondition(typeof alias === "string");
    const invocation = {
        requestId: crypto.randomUUID(),
        installationId: entry.id,
        contractId: context.content.release.contractId,
        contractVersion: context.content.release.version,
        capabilityId: "site.get",
    };
    const preparing = capability === "gateway.dispatch.prepare";
    const input = preparing
        ? {
              invocation,
              actor: { kind: "administrator", subjectId: context.environment.main.subjectId },
              deadline: Date.now() + 10 * 60_000,
              expectedSubjectId: alias,
          }
        : { ...invocation, subjectId: alias };
    let token: string | undefined;
    let delegation: Readonly<Record<string, unknown>> | undefined;
    return {
        async send() {
            const result = await context.call(capability, input, (output) => {
                const row = requireRecord(output);
                assertCondition(row.instanceId === context.environment.stack.instanceId);
                assertCondition(typeof row.token === "string" && row.token.length >= 20);
                token = row.token;
                if (preparing && row.delegation !== null) {
                    delegation = requireRecord(row.delegation);
                    assertCondition(
                        typeof delegation.ticket === "string" && Number.isSafeInteger(delegation.expiresAt),
                    );
                }
            });
            if (!result.observation.validated || !token) {
                return result.observation;
            }
            // The returned signed token must authenticate and complete the exact requested business read.
            // Check its thirty-second lease immediately, before later cold samples restart the Provider.
            // The observed root duration is already fixed; these postconditions do not enter root work counters.
            const read = await context.call(
                "site.get",
                {},
                (output) => {
                    const site = requireRecord(output);
                    assertCondition(typeof site.name === "string" && typeof site.visible === "boolean");
                },
                token,
                invocation.contractId,
                invocation.requestId,
            );
            const crossed = await context.call(
                "site.get",
                {},
                undefined,
                token,
                invocation.contractId,
                crypto.randomUUID(),
            );
            return read.observation.validated && !crossed.observation.validated && crossed.observation.status === 400
                ? result.observation
                : { ...result.observation, validated: false, failure: "issued-invocation-postcondition-failed" };
        },
        async verify() {
            await context.unauthorized(capability, input);
            const missing = { ...invocation, installationId: `missing-${crypto.randomUUID()}` };
            await context.refused(
                capability,
                preparing ? { ...input, invocation: missing } : { ...missing, subjectId: alias },
                [403, 404, 409],
            );
        },
        async close() {
            if (delegation) {
                await context.checked("gateway.delegation.close", {
                    context: {
                        siteId: TEST_SITE_ID,
                        ticket: delegation.ticket,
                        requestId: invocation.requestId,
                    },
                });
            }
        },
    };
}
