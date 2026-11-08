import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { ResourceInitializationOptions, ResourceInitializationGuard } from "../interfaces";
import { prepareResourceInitialization } from "../review";
import { readResourceInitialization, parseResourceReview, resourceInitializationError } from "../state";
import { readResourceIntent, resourceInitializationIntent, validateResourceIntent } from "./intents";
import { applyResourceInitialization } from "./apply";

export class ResourceInitializationService {
    private busy = false;
    constructor(private readonly options: ResourceInitializationOptions) {}
    async status(actorId: string) {
        await this.options.authorize(actorId);
        return readResourceInitialization(this.options);
    }
    plan(actorId: string, choice: "empty" | "base", locale: string, signal?: AbortSignal) {
        return this.exclusive(
            async () => (await prepareResourceInitialization(this.options, actorId, choice, locale, signal)).review,
        );
    }
    apply(
        actorId: string,
        input: unknown,
        browserRiskAcknowledgement: string | null,
        guard: ResourceInitializationGuard,
    ) {
        return this.exclusive(async () => {
            const review = parseResourceReview(input);
            guard.signal.throwIfAborted();
            guard.assertHeld();
            await this.options.authorize(actorId);
            if (
                review.actorId !== actorId ||
                review.instanceId !== this.options.instanceId ||
                review.siteId !== this.options.siteId
            ) {
                throw resourceInitializationError(
                    "Resource initialization review belongs to another actor or instance",
                    403,
                );
            }
            if (review.browserRisk.level !== "none" && browserRiskAcknowledgement !== review.browserRiskDigest) {
                throw resourceInitializationError("Resource browser authority must be explicitly acknowledged", 409);
            }
            let intent = await readResourceIntent(this.options, review);
            if (!intent) {
                const prepared = await prepareResourceInitialization(
                    this.options,
                    actorId,
                    review.choice,
                    review.locale,
                    guard.signal,
                );
                if (canonicalizeIJson(prepared.review) !== canonicalizeIJson(review)) {
                    throw resourceInitializationError("Resource initialization review is stale", 409);
                }
                guard.signal.throwIfAborted();
                guard.assertHeld();
                if (prepared.archive) {
                    await this.options.retained.put(review.digest, prepared.archive.bytes);
                }
                guard.signal.throwIfAborted();
                guard.assertHeld();
                intent = await this.options.intents.begin(
                    resourceInitializationIntent(review, this.options.now().toISOString()),
                );
                validateResourceIntent(intent, review);
            }
            return applyResourceInitialization(this.options, review, guard);
        });
    }
    private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
        if (this.busy) {
            throw resourceInitializationError("Resource initialization is already being prepared", 423);
        }
        this.busy = true;
        try {
            return await operation();
        } finally {
            this.busy = false;
        }
    }
}
