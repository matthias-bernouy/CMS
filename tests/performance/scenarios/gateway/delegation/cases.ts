import { renewPrimedDelegation } from "./renew";
import { ClientFailure } from "../../../harness/clients/failure";
import { assertCondition, requireRecord } from "../../queries/types";
import { assertApprovalStateUnchanged } from "../../providers/oracles";
import type { DelegationContext } from "./context";
import type { PreparedSample } from "../../../harness/execution/samples";

export async function prepareDelegation(
    context: DelegationContext,
    capability: string,
    invalidating = false,
): Promise<PreparedSample> {
    const fixture = context.context;
    const gateway = fixture.gateway;
    const issuing = capability === "gateway.delegation.issue";
    const closing = capability === "gateway.delegation.close";
    const before = await fixture.provider.snapshot();
    const close = async () => {
        try {
            await context.close();
        } finally {
            await fixture.close();
        }
    };
    return {
        async beforeMeasure() {
            context.source.deadline = Date.now() + 15_000;
            if (!issuing) {
                await context.issue();
                if (invalidating) {
                    await renewPrimedDelegation(context, gateway);
                }
                if (closing) {
                    context.check(await gateway.checked("gateway.delegation.check", { target: context.target() }));
                    await context.use();
                }
            }
        },
        async send() {
            const input = issuing
                ? { source: context.source }
                : closing
                  ? {
                        context: {
                            siteId: context.source.siteId,
                            ticket: context.delegation!.ticket,
                            requestId: context.source.requestId,
                        },
                    }
                  : { target: context.target() };
            const root = await gateway.call(capability, input, (value) => {
                if (issuing) {
                    context.capture(value);
                } else if (closing) {
                    assertCondition(requireRecord(value).accepted === true);
                } else {
                    context.check(value);
                }
            });
            if (!root.observation.validated) {
                return root.observation;
            }
            try {
                const target = context.target();
                const checkInput = { target };
                if (!closing) {
                    context.check(await gateway.checked("gateway.delegation.check", checkInput));
                    await context.use();
                    await gateway.refused(
                        "gateway.delegation.check",
                        { target: { ...target, sourceCredentialFingerprint: "0".repeat(64) } },
                        [403],
                    );
                    await gateway.refused(
                        "gateway.delegation.check",
                        { target: { ...target, contractId: "ulvia/cms.content", capabilityId: "site.get" } },
                        [403],
                    );
                    await fixture.originalGateway.refused("gateway.delegation.check", checkInput, [403]);
                    const wrongRoot = await gateway.checked("gateway.delegation.close", {
                        context: {
                            siteId: context.source.siteId,
                            ticket: context.delegation!.ticket,
                            requestId: crypto.randomUUID(),
                        },
                    });
                    assertCondition(requireRecord(wrongRoot).accepted === true);
                    context.check(await gateway.checked("gateway.delegation.check", checkInput));
                    await context.close();
                }
                await gateway.refused("gateway.delegation.check", checkInput, [403]);
                context.setClosed();
                const repeated = await gateway.checked("gateway.delegation.close", {
                    context: {
                        siteId: context.source.siteId,
                        ticket: context.delegation!.ticket,
                        requestId: context.source.requestId,
                    },
                });
                assertCondition(requireRecord(repeated).accepted === true);
                return root.observation;
            } catch (error) {
                return {
                    ...root.observation,
                    validated: false,
                    failure: error instanceof ClientFailure ? error.code : "delegation-state-postcondition-failed",
                };
            }
        },
        async verify() {
            assertApprovalStateUnchanged(before, await fixture.provider.snapshot());
        },
        close,
    };
}
