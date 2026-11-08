import { canonicalizeIJson, deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import { resourceDigest } from "resources/storage/records";
import { initializationReviewSchema, initializationStateSchema } from "./schemas";
import type {
    ResourceInitializationProgress,
    ResourceInitializationReview,
    ResourceInitializationState,
} from "./schemas";
import type { ResourceInitializationOptions } from "./interfaces";

export function emptyResourceProgress(): ResourceInitializationProgress {
    return { assets: [], texts: [], blocs: [], theme: false, pages: [], pageIds: {} };
}
export function pendingResourceInitialization(instanceId: string, siteId: string): ResourceInitializationState {
    return {
        protocol: "ulvia-resource-initialization/v1",
        instanceId,
        siteId,
        revision: 0,
        status: "pending",
        review: null,
        progress: emptyResourceProgress(),
    };
}
export function resourceInitializationError(message: string, status = 422): Error {
    return Object.assign(new Error(message), { status });
}
export function parseResourceReview(input: unknown): ResourceInitializationReview {
    if (Buffer.byteLength(canonicalizeIJson(input)) > 1024 * 1024) {
        throw resourceInitializationError("Resource review exceeds its byte limit");
    }
    const review = initializationReviewSchema.parse(input);
    const { digest, ...body } = review;
    if (resourceDigest(body) !== digest || resourceDigest(review.browserRisk) !== review.browserRiskDigest) {
        throw resourceInitializationError("Invalid resource review digest");
    }
    if (
        (review.choice === "empty") !== (review.archiveDigest === null) ||
        review.pages.length !== review.counts.pages ||
        new Set(review.pages.map((page) => page.path)).size !== review.pages.length
    ) {
        throw resourceInitializationError("Inconsistent resource review");
    }
    for (const name of ["assets", "texts", "blocs"] as const) {
        if (
            review.keys[name].length !== review.counts[name] ||
            new Set(review.keys[name]).size !== review.keys[name].length
        ) {
            throw resourceInitializationError("Inconsistent resource identities in review");
        }
    }
    return deepFreeze(review);
}
export function parseResourceInitializationState(input: unknown): ResourceInitializationState {
    const state = initializationStateSchema.parse(input);
    const progress = state.progress;
    for (const values of [progress.assets, progress.texts, progress.blocs, progress.pages]) {
        if (new Set(values).size !== values.length) {
            throw resourceInitializationError("Duplicate persisted resource checkpoint");
        }
    }
    if (state.status === "pending") {
        if (state.review !== null || canonicalizeIJson(progress) !== canonicalizeIJson(emptyResourceProgress())) {
            throw resourceInitializationError("Pending initialization contains progress");
        }
    } else {
        const review = parseResourceReview(state.review);
        if (
            review.instanceId !== state.instanceId ||
            review.siteId !== state.siteId ||
            progress.pages.some((path) => !review.pages.some((page) => page.path === path) || !progress.pageIds[path])
        ) {
            throw resourceInitializationError("Persisted resource initialization scope or progress mismatch");
        }
        for (const name of ["assets", "texts", "blocs"] as const) {
            if (progress[name].some((key) => !review.keys[name].includes(key))) {
                throw resourceInitializationError("Persisted checkpoint contains an unreviewed resource");
            }
        }
        if (
            Object.keys(progress.pageIds).some((path) => !review.pages.some((page) => page.path === path)) ||
            new Set(Object.values(progress.pageIds)).size !== Object.keys(progress.pageIds).length
        ) {
            throw resourceInitializationError("Persisted checkpoint contains an invalid Page identity");
        }
        if (
            state.status === "completed" &&
            (progress.assets.length !== review.counts.assets ||
                progress.texts.length !== review.counts.texts ||
                progress.blocs.length !== review.counts.blocs ||
                progress.pages.length !== review.counts.pages ||
                !progress.theme)
        ) {
            throw resourceInitializationError("Completed resource initialization is incomplete");
        }
    }
    return deepFreeze(state);
}
export async function readResourceInitialization(options: ResourceInitializationOptions) {
    const input = await options.state.read();
    if (!input) {
        throw resourceInitializationError("Resource initialization is not configured", 409);
    }
    const state = parseResourceInitializationState(input);
    if (state.instanceId !== options.instanceId || state.siteId !== options.siteId) {
        throw resourceInitializationError("Resource initialization scope mismatch", 409);
    }
    return state;
}
