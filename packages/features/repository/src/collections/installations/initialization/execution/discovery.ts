import type { CollectionRepositorySource } from "../../../sources/interfaces";
import { initializationError } from "./state";

/** Discovery uses bounded indexed summaries; full verification belongs to explicit planning. */
export async function discoverInitializationRecipes(
    source: CollectionRepositorySource,
    cursor = "",
    locale?: string,
    signal?: AbortSignal,
) {
    if (!source.recipes) {
        throw initializationError("The configured Repository does not support indexed recipe discovery", 503);
    }
    return source.recipes(
        { limit: 4, ...(cursor ? { cursor } : {}), ...(locale === undefined ? {} : { locale }) },
        signal,
    );
}
