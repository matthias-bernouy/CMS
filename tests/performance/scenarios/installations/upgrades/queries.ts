import { assertCondition, requireRecord } from "../../queries/types";
import { contractReview, completedUpgrade } from "./oracles";
import { INSTALLATIONS, grantKey } from "./context";
import type { UpgradeContext } from "./context";
import type { PreparedSample } from "../../../harness/execution/samples";

export async function prepareUpgradeRead(
    context: UpgradeContext,
    capability: string,
    binding: string,
): Promise<PreparedSample> {
    try {
        const review = contractReview(
            await context.plan(context.original.selections, context.targetGrants),
            context.original.selections,
            context.targetGrants,
        );
        const result = await context.apply(context.inputFor(review));
        assertCondition(result.observation.validated && typeof result.operationId === "string");
        const upgrade = completedUpgrade(result.output, Number(review.expectedRevision) + 1);
        const operation = capability === "get-operation";
        const input = operation ? { operationId: result.operationId } : { upgradeId: upgrade.upgradeId };
        const before = await context.snapshot();
        let measured: unknown;
        return {
            async send() {
                return (
                    await context.state.client(INSTALLATIONS, capability, binding, input, (value) => {
                        if (operation) {
                            const row = requireRecord(value);
                            assertCondition(
                                row.operationId === result.operationId &&
                                    row.status === "succeeded" &&
                                    row.capabilityId === "apply-contract-upgrade",
                            );
                            assertCondition(Number.isSafeInteger(row.revision) && Number(row.revision) >= 1);
                            completedUpgrade(row.result, Number(review.expectedRevision) + 1, upgrade.upgradeId);
                        } else {
                            completedUpgrade(value, Number(review.expectedRevision) + 1, upgrade.upgradeId);
                        }
                        measured = value;
                    })
                ).observation;
            },
            async verify() {
                assertCondition(grantKey(await context.read(capability, input)) === grantKey(measured));
                const missing = await context.state.client(
                    INSTALLATIONS,
                    capability,
                    "http",
                    operation ? { operationId: crypto.randomUUID() } : { upgradeId: `sha256:${"0".repeat(64)}` },
                );
                assertCondition(!missing.observation.validated && missing.observation.status === 404);
                const foreign = await context.state.client(INSTALLATIONS, capability, "http", input, undefined, {
                    httpCredentials: { cookie: context.environment.main.cookie },
                });
                assertCondition(!foreign.observation.validated && [401, 403].includes(foreign.observation.status));
                await context.invalid(capability, input, operation ? { operationId: "invalid" } : { upgradeId: "" });
                assertCondition(grantKey(await context.snapshot()) === grantKey(before));
            },
            close: context.close,
        };
    } catch (error) {
        await context.close();
        throw error;
    }
}
