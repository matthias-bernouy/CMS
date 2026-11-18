import { assertCondition } from "../../queries/types";
import { contractReview, completedUpgrade } from "./oracles";
import { INSTALLATIONS, DENIED_READ, grantKey } from "./context";
import type { UpgradeContext } from "./context";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { Variant } from "../../../capabilities/types";

export async function prepareContractSwitch(
    context: UpgradeContext,
    capability: string,
    binding: string,
    variant: Variant,
): Promise<PreparedSample> {
    try {
        const selections = context.original.selections;
        const input = { selections, grants: context.targetGrants };
        const plan = async () =>
            contractReview(await context.plan(selections, context.targetGrants), selections, input.grants);
        let review = await plan();
        const primedDigest = review.planDigest;
        const planning = capability === "plan-contract-upgrade";
        if (variant === "invalidation") {
            assertCondition(planning);
            const primedRevision = review.expectedRevision;
            const changed = await context.apply(context.inputFor(review));
            assertCondition(changed.observation.validated);
            review = { ...review, expectedRevision: Number(primedRevision) + 1 };
        }
        const before = await context.snapshot();
        const key = crypto.randomUUID();
        let applied: Readonly<Record<string, unknown>> | undefined;
        return {
            async send() {
                if (variant === "cold" && !planning) {
                    review = await plan();
                }
                if (planning) {
                    return (
                        await context.state.client(INSTALLATIONS, capability, binding, input, (value) => {
                            const current = contractReview(value, selections, input.grants);
                            assertCondition(
                                current.expectedRevision === review.expectedRevision &&
                                    (variant === "invalidation"
                                        ? current.planDigest !== primedDigest
                                        : variant === "cold" || current.planDigest === review.planDigest),
                            );
                        })
                    ).observation;
                }
                return (
                    await context.apply(context.inputFor(review), binding, key, (value) => {
                        applied = completedUpgrade(value, Number(review.expectedRevision) + 1);
                    })
                ).observation;
            },
            async verify() {
                const after = await context.snapshot();
                if (planning) {
                    assertCondition(grantKey(after) === grantKey(before));
                } else {
                    assertCondition(after.selectionRevision === Number(review.expectedRevision) + 1);
                    assertCondition(grantKey(after.selections) === grantKey(before.selections));
                    assertCondition(grantKey(after.pages) === grantKey(before.pages));
                    assertCondition(grantKey(after.collections) === grantKey(before.collections));
                    const saved = await context.read("get-contract-upgrade", { upgradeId: applied!.upgradeId });
                    assertCondition(grantKey(saved) === grantKey(applied));
                    const read = await context.state.client(DENIED_READ.contractId, DENIED_READ.capabilityId, "http", {
                        limit: 1,
                    });
                    assertCondition(
                        context.denied
                            ? read.observation.validated
                            : !read.observation.validated && read.observation.status === 403,
                    );
                    const replay = await context.apply(context.inputFor(review), "http", key);
                    assertCondition(replay.observation.validated && grantKey(replay.output) === grantKey(applied));
                }
                await context.invalid(
                    capability,
                    planning ? input : context.inputFor(review),
                    planning ? {} : { ...context.inputFor(review), planDigest: "invalid" },
                );
                const foreign = await context.state.client(
                    INSTALLATIONS,
                    capability,
                    "http",
                    planning ? input : context.inputFor(review),
                    undefined,
                    { httpCredentials: { cookie: context.environment.main.cookie } },
                );
                assertCondition(!foreign.observation.validated && [401, 403].includes(foreign.observation.status));
                assertCondition(grantKey(await context.snapshot()) === grantKey(after));
            },
            close: context.close,
        };
    } catch (error) {
        await context.close();
        throw error;
    }
}
