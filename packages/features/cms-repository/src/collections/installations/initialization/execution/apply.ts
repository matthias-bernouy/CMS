import { initializationDigest } from "../planning/plan";
import type { InitializationReview, InitializationServiceOptions } from "./interfaces";
import {
    assertEmptyInitialization,
    assertInitializationRoutesAvailable,
    initializationError,
    readInitialization,
} from "./state";
import { applyInitializationPages } from "./pages";

/** Multi-step initialization keeps the durable site maintenance fence until explicit completion. */
export async function executeInitialization(options: InitializationServiceOptions, review: InitializationReview) {
    const { siteId, digest: id } = review;
    const upgrades = options.upgrades;
    let intent = await upgrades.get<InitializationReview>(siteId, id, "initialization");
    if (!intent || intent.payload.digest !== id) {
        throw initializationError("Initialization intent is unavailable", 409);
    }
    if (intent.status === "completed") {
        return readInitialization(options);
    }
    if (intent.status === "cancelled") {
        throw initializationError("Initialization review is stale", 409);
    }
    if (!(await upgrades.claimMaintenance(siteId, id))) {
        throw initializationError("Initialization is already running", 423);
    }
    const assertLease = () => upgrades.assertMaintenance(siteId, id);
    try {
        let record = await readInitialization(options);
        if (intent.status === "prepared") {
            try {
                const snapshot = await assertEmptyInitialization(options);
                await assertInitializationRoutesAvailable(
                    options,
                    review.plan.pages.map(({ path }) => path),
                );
                const execution = await options.execution();
                if (
                    !(
                        (record.status === "pending" && record.revision === review.expectedRevision) ||
                        (record.status === "running" && record.review?.digest === review.digest)
                    ) ||
                    snapshot.systemRevision !== review.systemRevision ||
                    snapshot.collectionRevision !== review.collectionRevision ||
                    initializationDigest({
                        fingerprint: execution.fingerprint,
                        siteBlocsRevision: snapshot.siteBlocsRevision,
                    }) !== review.executionFingerprint
                ) {
                    throw initializationError("Initialization review is stale; review the recipe again", 409);
                }
            } catch (error) {
                await assertLease();
                await upgrades.transition(siteId, id, "prepared", "cancelled");
                throw error;
            }
            await assertLease();
            if (record.status === "pending") {
                await options.state.replace(
                    { ...record, status: "running", review, revision: record.revision + 1 },
                    record.revision,
                );
            }
            record = await readInitialization(options);
            await assertLease();
            await upgrades.transition(siteId, id, "prepared", "applying");
            intent = { ...intent, status: "applying" };
        }
        if (record.review?.digest !== review.digest) {
            throw initializationError("Initialization state belongs to another review", 409);
        }
        if (record.status !== "completed") {
            const snapshot = await options.collections.snapshot(siteId);
            if (snapshot.collections.length === 0 && review.plan.collections.length > 0) {
                await assertLease();
                await options.collections.installMany(
                    siteId,
                    review.plan.collections.map(({ digest }) => ({ digest, repositoryId: options.source.id })),
                    review.collectionRevision,
                );
            }
            const installed = await options.collections.snapshot(siteId);
            if (
                installed.collections.length !== review.plan.collections.length ||
                !review.plan.collections.every((pin) =>
                    installed.collections.some(
                        (item) => item.collectionId === pin.collectionId && item.digest === pin.digest,
                    ),
                )
            ) {
                throw initializationError("Initialization collection state changed", 409);
            }
            await applyInitializationPages(
                options.repository,
                review.plan,
                installed.collections.map(({ release }) => release),
                {
                    pageIds: record.pageIds,
                    completedPages: record.completedPages,
                    assertLease,
                    checkpoint: async (pageIds, completedPages) => {
                        await assertLease();
                        await options.state.replace(
                            {
                                ...record,
                                pageIds: { ...pageIds },
                                completedPages: [...completedPages],
                                revision: record.revision + 1,
                            },
                            record.revision,
                        );
                        record = await readInitialization(options);
                    },
                },
            );
            await assertLease();
            await options.state.replace(
                { ...record, status: "completed", revision: record.revision + 1 },
                record.revision,
            );
        }
        await assertLease();
        await upgrades.transition(siteId, id, "applying", "completed");
        return readInitialization(options);
    } finally {
        const latest = await upgrades.get(siteId, id, "initialization");
        if (latest && ["completed", "cancelled"].includes(latest.status)) {
            await upgrades.releaseMaintenance(siteId, id);
        } else {
            await upgrades.yieldMaintenance(siteId, id);
        }
    }
}
