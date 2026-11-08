import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { ResourceInitializationState } from "resources/initialization/schemas";
import type { ResourceOperationState, ResourceInitializationStatus } from "resources/application/interfaces/services";

export function resourceStatus(
    state: ResourceInitializationState,
    pending: boolean,
    operation: ResourceOperationState,
): ResourceInitializationStatus {
    const review = state.review;
    const paths = review?.pages.filter(({ visible }) => visible).map(({ path }) => path) ?? [];
    return {
        status: state.status === "completed" && pending ? "running" : state.status,
        revision: state.revision,
        choice: review?.choice ?? null,
        locale: review?.locale ?? null,
        planDigest: review?.digest ?? null,
        reviewJson: review ? canonicalizeIJson(review) : null,
        counts: review?.counts ?? { assets: 0, texts: 0, blocs: 0, pages: 0 },
        completed: {
            assets: state.progress.assets.length,
            texts: state.progress.texts.length,
            blocs: state.progress.blocs.length,
            pages: state.progress.pages.length,
        },
        redirectPath:
            state.status === "completed" && !pending
                ? paths.includes("/")
                    ? "/"
                    : paths.includes("/admin")
                      ? "/admin"
                      : (paths[0] ?? "")
                : "",
        ...operation,
    };
}
