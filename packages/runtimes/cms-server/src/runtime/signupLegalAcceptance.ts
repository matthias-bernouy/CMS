import { PageBackedSignupLegalAcceptancePolicy, type SignupLegalAcceptanceStore } from "@bernouy/cms-auth";
import {
    isPublishedPage,
    publishedPageSnapshot,
    serializePublishedPageSnapshot,
    type ContentReader,
} from "@bernouy/cms-content";

export function createSignupLegalAcceptancePolicy(
    repository: ContentReader,
    store: SignupLegalAcceptanceStore,
): PageBackedSignupLegalAcceptancePolicy {
    return new PageBackedSignupLegalAcceptancePolicy({
        documents: async () => {
            const system = await repository.getSystem();
            return system.auth?.signupLegalDocuments ?? [];
        },
        resolvePublishedPage: async (pageId) => {
            const page = await repository.getPageById(pageId);
            if (!isPublishedPage(page)) {
                return null;
            }
            const snapshot = publishedPageSnapshot(page);
            return {
                snapshot,
                canonicalSnapshot: serializePublishedPageSnapshot(snapshot),
            };
        },
        store,
    });
}
