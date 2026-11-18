import { catalogueRevision, canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";
import { completedCollectionUpgrade } from "../oracles";
import { seedCollectionRecovery } from "./seed";
import { assertRecoveredReader } from "../../upgrades/recovery/readOracle";
import type { CollectionUpgradeContext } from "../context";
import type { PreparedSample } from "../../../../harness/execution/samples";

export async function prepareRecoveredCollectionRead(
    context: CollectionUpgradeContext,
    binding: string,
): Promise<PreparedSample> {
    let upgradeId: string | undefined;
    const resume = () =>
        context.apply({ upgradeId }, "http", crypto.randomUUID(), undefined, "resume-collection-upgrade");
    const close = async () => {
        try {
            if (upgradeId) {
                const saved = await context.read("get-collection-upgrade", { upgradeId });
                if (["prepared", "applying"].includes(String(saved.status))) {
                    assertCondition((await resume()).observation.validated, "collection-recovery-read-cleanup-resume");
                }
            }
        } finally {
            await context.close();
        }
    };
    try {
        const review = await context.plan();
        upgradeId = await catalogueRevision({ siteId: "default", planDigest: review.planDigest });
        await seedCollectionRecovery(context, review, upgradeId);
        const expected = { id: upgradeId, kind: "collection" as const, revision: Number(review.expectedRevision) };
        const input = { upgradeId };
        const primed = await context.state.client(
            "ulvia/cms.installations",
            "get-collection-upgrade",
            binding,
            input,
            (output) => assertRecoveredReader(output, "get-collection-upgrade", expected, false),
        );
        assertCondition(primed.observation.validated, "collection-recovery-read-prepared-prime");
        const resumed = await resume();
        assertCondition(resumed.observation.validated, "collection-recovery-read-resumed");
        const completed = completedCollectionUpgrade(resumed.output, expected.revision + 1, upgradeId);
        const saved = await context.verify(true, completed);
        return {
            async send() {
                return (
                    await context.state.client(
                        "ulvia/cms.installations",
                        "get-collection-upgrade",
                        binding,
                        input,
                        (output) => assertRecoveredReader(output, "get-collection-upgrade", expected, true),
                    )
                ).observation;
            },
            async verify() {
                const foreign = await context.state.client(
                    "ulvia/cms.installations",
                    "get-collection-upgrade",
                    "http",
                    input,
                    undefined,
                    { httpCredentials: { cookie: context.environment.main.cookie } },
                );
                assertCondition(
                    !foreign.observation.validated && [401, 403].includes(foreign.observation.status),
                    "collection-recovery-read-foreign-session",
                );
                const missing = await context.state.client(
                    "ulvia/cms.installations",
                    "get-collection-upgrade",
                    "http",
                    { upgradeId: `sha256:${"0".repeat(64)}` },
                );
                assertCondition(
                    !missing.observation.validated && missing.observation.status === 404,
                    "collection-recovery-read-missing-intent",
                );
                assertCondition(
                    canonicalizeIJson(await context.snapshot()) === canonicalizeIJson(saved),
                    "collection-recovery-read-refusal-preserves-state",
                );
                assertRecoveredReader(
                    await context.read("get-collection-upgrade", input),
                    "get-collection-upgrade",
                    expected,
                    true,
                );
            },
            close,
        };
    } catch (error) {
        await close();
        throw error;
    }
}
