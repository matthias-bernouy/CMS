import type { ResourceInitializationOptions } from "../interfaces";
import type { ResourceInitializationReview } from "../schemas";
import { readResourceInitialization, resourceInitializationError } from "../state";

/** Invalidate the old public review before terminal cancellation; no content has been copied. */
export async function cancelPreparedResourceInitialization(
    options: ResourceInitializationOptions,
    review: ResourceInitializationReview,
    assertHeld: () => Promise<void>,
): Promise<void> {
    await assertHeld();
    const state = await readResourceInitialization(options);
    if (state.status !== "pending") {
        throw resourceInitializationError("Cannot cancel initialization after resource copying has started", 409);
    }
    await options.state.replace({ ...state, revision: state.revision + 1 }, state.revision);
    await assertHeld();
    await options.intents.transition(options.siteId, review.digest, "prepared", "cancelled");
}
