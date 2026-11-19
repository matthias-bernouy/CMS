import { seedContractRecovery } from "./seed";
import { preparedContractIntent } from "./intent";
import { requireRecord } from "../../../queries/types";
import { contractReview, completedUpgrade } from "../oracles";
import { INSTALLATIONS, DENIED_READ, grantKey } from "../context";
import { assertCondition } from "../../../queries/types";
import type { UpgradeContext } from "../context";
import type { PreparedSample } from "../../../../harness/execution/samples";

export async function prepareContractRecovery(context: UpgradeContext, binding: string): Promise<PreparedSample> {
    let upgradeId: string | undefined;
    const resume = (transport = "http", key = crypto.randomUUID(), assert?: (value: unknown) => void) =>
        context.apply({ upgradeId }, transport, key, assert, "resume-contract-upgrade");
    const close = async () => {
        try {
            if (upgradeId) {
                const saved = await context.state.client(INSTALLATIONS, "get-contract-upgrade", "http", { upgradeId });
                assertCondition(saved.observation.validated || saved.observation.status === 404);
                const status = saved.observation.validated ? requireRecord(saved.output).status : undefined;
                if (status === "prepared" || status === "applying") {
                    // Recovery during cleanup earns no credit and cannot turn a failed root measurement green.
                    const recovered = await resume();
                    assertCondition(recovered.observation.validated);
                }
            }
        } finally {
            await context.close();
        }
    };
    try {
        const review = contractReview(
            await context.plan(context.original.selections, context.targetGrants),
            context.original.selections,
            context.targetGrants,
        );
        const before = await context.snapshot();
        const intent = await preparedContractIntent(context.original, review);
        upgradeId = intent.id;
        await seedContractRecovery(context, intent);
        const prepared = await context.read("get-contract-upgrade", { upgradeId });
        assertCondition(prepared.status === "prepared" && prepared.selectionRevision === before.selectionRevision);
        const key = crypto.randomUUID();
        const input = { upgradeId };
        return {
            async send() {
                const pending = await context.read("get-contract-upgrade", input);
                assertCondition(pending.status === "prepared" && pending.selectionRevision === review.expectedRevision);
                return (
                    await resume(binding, key, (value) =>
                        completedUpgrade(value, Number(review.expectedRevision) + 1, upgradeId),
                    )
                ).observation;
            },
            async verify() {
                const saved = await context.snapshot();
                assertCondition(saved.selectionRevision === Number(before.selectionRevision) + 1);
                assertCondition(
                    grantKey(saved.selections) === grantKey(before.selections) &&
                        grantKey(saved.pages) === grantKey(before.pages) &&
                        grantKey(saved.collections) === grantKey(before.collections),
                );
                const completed = await context.read("get-contract-upgrade", input);
                completedUpgrade(completed, Number(review.expectedRevision) + 1, upgradeId);
                const denied = await context.state.client(DENIED_READ.contractId, DENIED_READ.capabilityId, "http", {});
                assertCondition(
                    context.denied
                        ? denied.observation.validated
                        : !denied.observation.validated && denied.observation.status === 403,
                );
                const replay = await resume("http", key);
                assertCondition(replay.observation.validated && grantKey(replay.output) === grantKey(completed));
                await context.invalid("resume-contract-upgrade", input, { upgradeId: "" });
                const foreign = await context.state.client(
                    INSTALLATIONS,
                    "resume-contract-upgrade",
                    "http",
                    input,
                    undefined,
                    { httpCredentials: { cookie: context.environment.main.cookie } },
                );
                assertCondition(!foreign.observation.validated && [401, 403].includes(foreign.observation.status));
                assertCondition(grantKey(await context.snapshot()) === grantKey(saved));
            },
            close,
        };
    } catch (error) {
        await close();
        throw error;
    }
}
