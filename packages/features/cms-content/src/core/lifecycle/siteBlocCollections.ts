import { randomUUIDv7 } from "bun";
import type { SiteBlocCollection } from "cms-content/interfaces/blocs";
import { ContentValidationError } from "cms-content/core/validation/errors";

export const DEFAULT_SITE_BLOC_COLLECTION_ID = "site";

export function siteBlocCollections(collections: SiteBlocCollection[]): SiteBlocCollection[] {
    return [
        { id: DEFAULT_SITE_BLOC_COLLECTION_ID, name: "Site", description: "Compositions created for this site." },
        ...structuredClone(collections).sort(
            (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
        ),
    ];
}

export function validateSiteBlocCollectionInput(input: Omit<SiteBlocCollection, "id">): Omit<SiteBlocCollection, "id"> {
    if (!input || typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 120) {
        throw new ContentValidationError("name", "a name of 1 to 120 characters is required");
    }
    if (typeof input.description !== "string" || input.description.length > 1000) {
        throw new ContentValidationError("description", "a description of at most 1000 characters is required");
    }
    return { name: input.name.trim(), description: input.description.trim() };
}

export function createSiteBlocCollection(input: Omit<SiteBlocCollection, "id">): SiteBlocCollection {
    return { id: randomUUIDv7(), ...validateSiteBlocCollectionInput(input) };
}
