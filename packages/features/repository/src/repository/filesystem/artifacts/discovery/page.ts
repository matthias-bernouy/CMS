import { createHash } from "node:crypto";
import { canonicalIJsonBytes } from "@bernouy/ulvia-contracts/protocol";
import { resolveCollectionTranslation } from "repository/collections/core/texts/translationCatalogue";
import { RepositoryRequestError } from "repository/repository/core/errors";
import type { RecipeCatalogueInput } from "repository/application/registry/interfaces/inputs";
import type { RecipeCatalogueOutput } from "repository/application/registry/interfaces/outputs";
import type { RecipeProjection } from "./projections";

export type RecipeRow = { projection: RecipeProjection; recipe: RecipeProjection["recipes"][number] };
export type RecipeSnapshot = { digest: string; rows: readonly RecipeRow[] };

export async function recipePage(
    load: () => Promise<RecipeSnapshot>,
    input: RecipeCatalogueInput,
    signal?: AbortSignal,
): Promise<RecipeCatalogueOutput> {
    signal?.throwIfAborted();
    const cursor = input.cursor ?? "";
    if (
        !Number.isSafeInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > 64 ||
        (cursor !== "" && !/^[0-9a-f]{64}\/(?:0|[1-9][0-9]{0,5})$/u.test(cursor))
    ) {
        throw new RepositoryRequestError("REJECTED", "Invalid recipe pagination");
    }
    let locale: string | undefined;
    try {
        locale = input.locale === undefined ? undefined : Intl.getCanonicalLocales(input.locale)[0];
        if (input.locale !== undefined && (!locale || input.locale.length > 64)) {
            throw new Error("Invalid locale");
        }
    } catch {
        throw new RepositoryRequestError("REJECTED", "Invalid recipe locale");
    }
    const snapshot = await activeSnapshot(load, signal);
    signal?.throwIfAborted();
    const scope = createHash("sha256")
        .update(`${snapshot.digest}\0${locale ?? ""}`)
        .digest("hex");
    const offset = cursor ? Number(cursor.split("/")[1]) : 0;
    if (offset > snapshot.rows.length || (cursor !== "" && cursor !== `${scope}/${offset}`)) {
        throw new RepositoryRequestError("REJECTED", "Recipe catalogue cursor is stale or out of scope");
    }
    const rows = snapshot.rows.slice(offset, offset + input.limit);
    const items = rows.map(({ projection, recipe }) => ({
        root: {
            publisherId: projection.publisherId,
            collectionId: projection.collectionId,
            version: projection.version,
            digest: projection.digest,
            bootstrapId: recipe.id,
        },
        label: resolveCollectionTranslation(projection, recipe.label, locale),
        description: resolveCollectionTranslation(projection, recipe.description, locale),
        pageCount: recipe.pageCount,
        includeCount: recipe.includeCount,
    }));
    if (canonicalIJsonBytes(items, 12).byteLength > 1024 * 1024) {
        throw new RepositoryRequestError("CORE_UNAVAILABLE", "Recipe page exceeds its byte bound");
    }
    return { items, cursor: offset + rows.length < snapshot.rows.length ? `${scope}/${offset + rows.length}` : "" };
}

/** Cancelling one reader does not abort a bounded index load shared by other requests. */
async function activeSnapshot(load: () => Promise<RecipeSnapshot>, signal?: AbortSignal) {
    if (!signal) {
        return load();
    }
    const canceled = Promise.withResolvers<never>();
    const abort = () => canceled.reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    try {
        signal.throwIfAborted();
        return await Promise.race([load(), canceled.promise]);
    } finally {
        signal.removeEventListener("abort", abort);
    }
}
