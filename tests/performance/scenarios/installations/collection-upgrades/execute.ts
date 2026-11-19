import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { responseBytes } from "../../../harness/transport/http";
import { assertCondition } from "../../queries/types";
import { collectionReview, completedCollectionUpgrade } from "./oracles";
import { COLLECTION_UPGRADE_SCHEMA_INVALID_ID } from "./context";
import type { CollectionUpgradeContext } from "./context";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { Variant } from "../../../capabilities/types";

const CONTRACT = "ulvia/cms.installations";

export async function prepareCollectionUpgrade(
    context: CollectionUpgradeContext,
    capability: string,
    binding: string,
    variant: Variant,
): Promise<PreparedSample> {
    try {
        const planning = capability === "plan-collection-upgrade";
        const reading = capability === "get-collection-upgrade";
        let review = await context.plan();
        const primedDigest = review.planDigest;
        if (variant === "invalidation") {
            assertCondition(planning);
            await context.editPage();
        }
        let upgrade: Readonly<Record<string, unknown>> | undefined;
        if (reading) {
            const result = await context.apply(context.inputFor(review));
            assertCondition(result.observation.validated);
            upgrade = completedCollectionUpgrade(result.output, Number(review.expectedRevision) + 1);
        }
        const key = crypto.randomUUID();
        const input = () =>
            planning
                ? { targets: [context.to] }
                : reading
                  ? { upgradeId: upgrade!.upgradeId }
                  : context.inputFor(review);
        return {
            async send() {
                if (variant === "cold" && !planning && !reading) {
                    review = await context.plan();
                }
                if (!planning && !reading) {
                    return (
                        await context.apply(input(), binding, key, (value) => {
                            upgrade = completedCollectionUpgrade(value, Number(review.expectedRevision) + 1);
                        })
                    ).observation;
                }
                return (
                    await context.state.client(CONTRACT, capability, binding, input(), (value) => {
                        if (planning) {
                            const measured = collectionReview(value, context.to, context.before.detail);
                            if (variant === "invalidation") {
                                assertCondition(measured.planDigest !== primedDigest);
                            } else if (variant !== "cold") {
                                assertCondition(measured.planDigest === review.planDigest);
                            }
                        } else {
                            completedCollectionUpgrade(value, Number(review.expectedRevision) + 1, upgrade!.upgradeId);
                        }
                    })
                ).observation;
            },
            async verify() {
                const saved = await context.verify(!planning, upgrade);
                if (!planning) {
                    const response = await fetch(new URL(String(saved.page.path), context.state.session.origin), {
                        redirect: "manual",
                        signal: AbortSignal.timeout(30_000),
                    });
                    const bytes = await responseBytes(response);
                    assertCondition(
                        response.status === 200 && new TextDecoder().decode(bytes).includes(context.marker),
                    );
                }
                if (!planning && !reading) {
                    const replay = await context.apply(input(), "http", key);
                    assertCondition(
                        replay.observation.validated && canonicalizeIJson(replay.output) === canonicalizeIJson(upgrade),
                    );
                    const conflict = await context.apply(
                        { ...input(), planDigest: `sha256:${"0".repeat(64)}` },
                        "http",
                        key,
                    );
                    assertCondition(!conflict.observation.validated && conflict.observation.status === 409);
                }
                if (reading) {
                    const missing = await context.state.client(CONTRACT, capability, "http", {
                        upgradeId: `sha256:${"0".repeat(64)}`,
                    });
                    assertCondition(!missing.observation.validated && missing.observation.status === 404);
                }
                await context.invalid(
                    capability,
                    input(),
                    reading ? { upgradeId: COLLECTION_UPGRADE_SCHEMA_INVALID_ID } : { ...input(), targets: [] },
                );
                const foreign = await context.state.client(CONTRACT, capability, "http", input(), undefined, {
                    httpCredentials: { cookie: context.environment.main.cookie },
                });
                assertCondition(!foreign.observation.validated && [401, 403].includes(foreign.observation.status));
                assertCondition(canonicalizeIJson(await context.snapshot()) === canonicalizeIJson(saved));
            },
            close: context.close,
        };
    } catch (error) {
        await context.close();
        throw error;
    }
}
