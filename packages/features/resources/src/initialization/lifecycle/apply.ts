import { resourceDigest } from "resources/storage/records";
import { copyResourceContent } from "../execution/copy";
import { assertResourceTargetEmpty } from "../review";
import { assertResourceRequirements } from "./requirements";
import { cancelPreparedResourceInitialization } from "./cancelPrepared";
import { readResourceIntent } from "./intents";
import type { ResourceInitializationOptions, ResourceInitializationGuard } from "../interfaces";
import type { ResourceInitializationReview } from "../schemas";
import { readResourceInitialization, resourceInitializationError, parseResourceInitializationState } from "../state";

/** A failed application yields its lease but retains site maintenance until a durable terminal state. */
export async function applyResourceInitialization(
    options: ResourceInitializationOptions,
    review: ResourceInitializationReview,
    guard: ResourceInitializationGuard,
) {
    const { siteId, digest: id } = review;
    const intents = options.intents;
    if (!(await intents.claimMaintenance(siteId, id))) {
        throw resourceInitializationError("Resource initialization is already running", 423);
    }
    const assertHeld = async () => {
        guard.signal.throwIfAborted();
        guard.assertHeld();
        await intents.assertMaintenance(siteId, id);
        guard.signal.throwIfAborted();
        guard.assertHeld();
    };
    try {
        await assertHeld();
        await options.authorize(review.actorId);
        let intent = await readResourceIntent(options, review);
        if (!intent || intent.status === "cancelled") {
            throw resourceInitializationError("Resource initialization intent is unavailable", 409);
        }
        let state = await readResourceInitialization(options);
        if (intent.status === "completed") {
            if (state.status !== "completed" || state.review?.digest !== id) {
                throw resourceInitializationError("Completed resource initialization state is inconsistent", 409);
            }
            return state;
        }
        try {
            const execution = await options.execution();
            if (resourceDigest(execution.fingerprint) !== review.executionFingerprint) {
                throw resourceInitializationError("Selected execution changed after review", 409);
            }
            assertResourceRequirements(review.requirements, execution);
        } catch (error) {
            if (intent.status === "prepared" && state.status === "pending") {
                await cancelPreparedResourceInitialization(options, review, assertHeld);
            }
            throw error;
        }
        if (intent.status === "prepared") {
            if (state.status === "pending") {
                try {
                    await assertResourceTargetEmpty(options);
                    if (
                        state.revision !== review.stateRevision ||
                        (await options.content.getSystemRevision()) !== review.systemRevision
                    ) {
                        throw resourceInitializationError("Resource initialization review is stale", 409);
                    }
                } catch (error) {
                    await cancelPreparedResourceInitialization(options, review, assertHeld);
                    throw error;
                }
                await assertHeld();
                await options.state.replace(
                    { ...state, status: "running", review, revision: state.revision + 1 },
                    state.revision,
                );
                state = await readResourceInitialization(options);
            }
            if (state.status !== "running" || state.review?.digest !== id) {
                throw resourceInitializationError("Resource initialization belongs to another review", 409);
            }
            await assertHeld();
            await intents.transition(siteId, id, "prepared", "applying");
            intent = { ...intent, status: "applying" };
        }
        if (state.review?.digest !== id || state.status === "pending") {
            throw resourceInitializationError("Resource initialization state does not match its intent", 409);
        }
        if (state.status !== "completed") {
            const bytes = review.archiveDigest ? await options.retained.get(review.digest) : null;
            if (review.archiveDigest && !bytes) {
                throw resourceInitializationError("Reviewed resource archive is unavailable for recovery", 409);
            }
            const archive = bytes ? await options.verify(bytes, review.archiveDigest!, guard.signal) : null;
            if ((archive?.digest ?? null) !== review.archiveDigest) {
                throw resourceInitializationError("Recovery archive does not match its review", 409);
            }
            await assertHeld();
            const currentExecution = await options.execution();
            if (resourceDigest(currentExecution.fingerprint) !== review.executionFingerprint) {
                throw resourceInitializationError("Selected execution changed during archive recovery", 409);
            }
            assertResourceRequirements(review.requirements, currentExecution);
            const copied = await copyResourceContent(
                archive,
                options,
                {
                    initial: state.progress,
                    signal: guard.signal,
                    assertHeld,
                    checkpoint: async (progress) => {
                        await assertHeld();
                        const next = parseResourceInitializationState({
                            ...state,
                            progress: structuredClone(progress),
                            revision: state.revision + 1,
                        });
                        await options.state.replace(next, state.revision);
                        state = await readResourceInitialization(options);
                    },
                },
                review,
            );
            await assertHeld();
            await options.state.replace(
                parseResourceInitializationState({
                    ...state,
                    progress: copied.progress,
                    status: "completed",
                    revision: state.revision + 1,
                }),
                state.revision,
            );
        }
        await assertHeld();
        await intents.transition(siteId, id, "applying", "completed");
        return readResourceInitialization(options);
    } finally {
        // An expired worker must never release a successor's fence.
        guard.signal.throwIfAborted();
        guard.assertHeld();
        const latest = await readResourceIntent(options, review);
        if (latest && ["completed", "cancelled"].includes(latest.status)) {
            await intents.releaseMaintenance(siteId, id);
            if (review.archiveDigest) {
                await options.retained.remove(review.digest);
            }
        } else {
            await intents.yieldMaintenance(siteId, id);
        }
    }
}
