import {
    ContentValidationError,
    DEFAULT_SITE_BLOC_COLLECTION_ID,
    type SiteBlocCollection,
    validateSiteBlocCollectionInput,
} from "@bernouy/cms-content";
import type { ControlCms } from "cms-control/ControlCms";

export function parseSiteBlocCollectionInput(body: Record<string, unknown>): Omit<SiteBlocCollection, "id"> {
    return validateSiteBlocCollectionInput({
        name: body.name as string,
        ...(body.icon !== undefined ? { icon: body.icon as SiteBlocCollection["icon"] } : {}),
        description: (body.description ?? "") as string,
    });
}

export async function requireSiteBlocCollection(
    cms: ControlCms,
    id = DEFAULT_SITE_BLOC_COLLECTION_ID,
): Promise<string> {
    const collections = await cms.repository.getSiteBlocCollections();
    if (!collections.some((collection) => collection.id === id)) {
        throw new ContentValidationError("collectionId", "site collection was not found");
    }
    return id;
}

export async function importedSiteBlocCollection(cms: ControlCms, id?: string): Promise<string> {
    const collections = await cms.repository.getSiteBlocCollections();
    return collections.some((collection) => collection.id === id) ? id! : DEFAULT_SITE_BLOC_COLLECTION_ID;
}
