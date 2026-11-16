import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { releaseChannel } from "@bernouy/ulvia-contracts/compatibility";
import { recipeCatalogueOutputSchema } from "./recipeSchema";
import type { RecipeCatalogueInput } from "./recipeSchema";
import { getRepositoryBytes } from "repository/repository-http/getBytes";
import type { RepositoryFetch } from "repository/repository-http/getBytes";
import { validCollectionReference } from "./parseCatalogue";

export async function readRecipePage(
    base: URL,
    input: RecipeCatalogueInput,
    signal?: AbortSignal,
    request?: RepositoryFetch,
) {
    const bytes = await getRepositoryBytes(base, "v1/recipes", "Bootstrap recipes", {
        request,
        signal,
        query: input,
        maxBytes: 1024 * 1024,
    });
    const result = recipeCatalogueOutputSchema.parse(parseStrictJson(bytes, 1024 * 1024, 12));
    const roots = result.items.map(
        ({ root }) => `${root.publisherId}\0${root.collectionId}\0${root.version}\0${root.bootstrapId}`,
    );
    if (
        result.items.length > input.limit ||
        new Set(roots).size !== roots.length ||
        result.items.some(({ root }) => !validCollectionReference(root) || releaseChannel(root.version) !== "stable")
    ) {
        throw new TypeError("Invalid recipe catalogue references or page size");
    }
    return result;
}
