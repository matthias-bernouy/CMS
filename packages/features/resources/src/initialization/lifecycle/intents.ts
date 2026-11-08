import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { resourceDigest } from "resources/storage/records";
import type { ResourceInitializationOptions, ResourceInitializationIntent } from "../interfaces";
import type { ResourceInitializationReview } from "../schemas";
import { parseResourceReview, resourceInitializationError } from "../state";
const resourceInitializationKind = "resource-initialization";

export function resourceInitializationIntent(
    review: ResourceInitializationReview,
    createdAt: string,
): ResourceInitializationIntent<ResourceInitializationReview> {
    return {
        id: review.digest,
        siteId: review.siteId,
        kind: resourceInitializationKind,
        planDigest: review.digest,
        expectedRevision: review.stateRevision,
        sourceStateDigest: resourceDigest({
            pending: true,
            instanceId: review.instanceId,
            revision: review.stateRevision,
        }),
        targetStateDigest: resourceDigest({ completed: true, review: review.digest }),
        status: "prepared",
        createdAt,
        payload: review,
    };
}
export function validateResourceIntent(
    intent: ResourceInitializationIntent<unknown>,
    review: ResourceInitializationReview,
): void {
    const expected = resourceInitializationIntent(review, intent.createdAt);
    const { status: _status, ...actual } = intent;
    const { status: _expectedStatus, ...body } = expected;
    parseResourceReview(intent.payload);
    if (
        !["prepared", "applying", "completed", "cancelled"].includes(intent.status) ||
        !Number.isFinite(Date.parse(intent.createdAt)) ||
        canonicalizeIJson(actual) !== canonicalizeIJson(body)
    ) {
        throw resourceInitializationError("Initialization intent does not match the exact reviewed scope", 409);
    }
}
export async function readResourceIntent(options: ResourceInitializationOptions, review: ResourceInitializationReview) {
    const intent = await options.intents.get<unknown>(options.siteId, review.digest, resourceInitializationKind);
    if (intent) {
        validateResourceIntent(intent, review);
    }
    return intent;
}
