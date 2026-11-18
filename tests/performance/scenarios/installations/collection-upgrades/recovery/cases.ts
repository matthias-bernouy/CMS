import { catalogueRevision, canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";
import { completedCollectionUpgrade, assertCollectionReplayConflict } from "../oracles";
import { seedCollectionRecovery } from "./seed";
import { responseBytes } from "../../../../harness/transport/http";
import type { CollectionUpgradeContext } from "../context";
import type { PreparedSample } from "../../../../harness/execution/samples";

const CONTRACT = "ulvia/cms.installations";
const CAPABILITY = "resume-collection-upgrade";

export async function prepareCollectionRecovery(
    context: CollectionUpgradeContext,
    binding: string,
): Promise<PreparedSample> {
    let upgradeId: string | undefined;
    const resume = (transport = "http", key = crypto.randomUUID(), assert?: (value: unknown) => void, id = upgradeId) =>
        context.apply({ upgradeId: id }, transport, key, assert, CAPABILITY);
    const close = async () => {
        try {
            if (upgradeId) {
                const saved = await context.state.client(CONTRACT, "get-collection-upgrade", "http", { upgradeId });
                assertCondition(saved.observation.validated || saved.observation.status === 404);
                if (
                    saved.observation.validated &&
                    ["prepared", "applying"].includes(String(requireRecord(saved.output).status))
                ) {
                    assertCondition((await resume()).observation.validated);
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
        const key = crypto.randomUUID();
        let completed: Readonly<Record<string, unknown>> | undefined;
        return {
            async beforeMeasure() {
                const saved = await context.read("get-collection-upgrade", { upgradeId });
                assertCondition(
                    saved.status === "prepared" && saved.collectionRevision === review.expectedRevision,
                    "collection-recovery-not-prepared",
                );
            },
            async send() {
                return (
                    await resume(binding, key, (value) => {
                        completed = completedCollectionUpgrade(value, Number(review.expectedRevision) + 1, upgradeId);
                    })
                ).observation;
            },
            async verify() {
                const saved = await context.verify(true, completed);
                const response = await fetch(new URL(String(saved.page.path), context.state.session.origin), {
                    redirect: "manual",
                    signal: AbortSignal.timeout(30_000),
                });
                const bytes = await responseBytes(response);
                assertCondition(response.status === 200 && new TextDecoder().decode(bytes).includes(context.marker));
                const replay = await resume(binding, key);
                assertCondition(
                    replay.observation.validated && canonicalizeIJson(replay.output) === canonicalizeIJson(completed),
                );
                const conflict = await resume(binding, key, undefined, `sha256:${"0".repeat(64)}`);
                assertCollectionReplayConflict(conflict.observation, binding);
                await context.invalid(CAPABILITY, { upgradeId }, { upgradeId: "x".repeat(72) });
                const foreign = await context.state.client(CONTRACT, CAPABILITY, "http", { upgradeId }, undefined, {
                    httpCredentials: { cookie: context.environment.main.cookie },
                });
                assertCondition(!foreign.observation.validated && [401, 403].includes(foreign.observation.status));
                assertCondition(canonicalizeIJson(await context.snapshot()) === canonicalizeIJson(saved));
            },
            close,
        };
    } catch (error) {
        await close();
        throw error;
    }
}
