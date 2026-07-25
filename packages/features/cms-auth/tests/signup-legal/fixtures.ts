import {
    InMemorySignupLegalAcceptanceStore,
    PageBackedSignupLegalAcceptancePolicy,
    type SignupLegalDocumentDefinition,
    type SignupLegalPageSnapshot,
} from "@bernouy/cms-auth";

export const LEGAL_PAGE: SignupLegalPageSnapshot = {
    id: "page-cgu",
    path: "/terms",
    title: "Terms of use",
    description: "Current terms",
    content: "<main>Version one</main>",
};

export function createLegalPolicy() {
    const store = new InMemorySignupLegalAcceptanceStore();
    const state: {
        definitions: SignupLegalDocumentDefinition[];
        page: SignupLegalPageSnapshot | null;
        canonicalSnapshot?: string;
    } = {
        definitions: [
            {
                key: "terms-of-use",
                label: "Terms of use",
                consentText: "I accept the terms of use.",
                pageId: LEGAL_PAGE.id,
                enabled: true,
            },
        ],
        page: structuredClone(LEGAL_PAGE),
    };
    const policy = new PageBackedSignupLegalAcceptancePolicy({
        documents: async () => state.definitions,
        resolvePublishedPage: async (pageId) => {
            if (!state.page || state.page.id !== pageId) {
                return null;
            }
            return {
                snapshot: structuredClone(state.page),
                canonicalSnapshot: state.canonicalSnapshot ?? canonicalPage(state.page),
            };
        },
        store,
        now: () => new Date("2026-07-25T10:00:00.000Z"),
        createId: () => "acceptance-1",
    });
    return { policy, state, store };
}

export function canonicalPage(page: SignupLegalPageSnapshot): string {
    return JSON.stringify({
        id: page.id,
        path: page.path,
        title: page.title,
        description: page.description,
        content: page.content,
    });
}
