import type { RepositoryService } from "@bernouy/repository/features/repository";

type Overrides = { readonly [Key in keyof RepositoryService]?: Partial<RepositoryService[Key]> };
const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected Repository test service call");
};
/** Missing fixture actions are loud traps, never silent successful business operations. */
export function repositoryServices(overrides: Overrides = {}): RepositoryService {
    return {
        reads: {
            info: unexpected,
            namespace: unexpected,
            catalogue: unexpected,
            search: unexpected,
            publicationState: unexpected,
            release: unexpected,
            asset: unexpected,
            ...overrides.reads,
        },
        namespaces: {
            list: unexpected,
            claim: unexpected,
            transfer: unexpected,
            suspend: unexpected,
            ...overrides.namespaces,
        },
        sources: {
            getCollection: unexpected,
            putCollection: unexpected,
            getArtifact: unexpected,
            putArtifact: unexpected,
            ...overrides.sources,
        },
        publications: {
            begin: unexpected,
            status: unexpected,
            asset: unexpected,
            commit: unexpected,
            abort: unexpected,
            yank: unexpected,
            checkCollection: unexpected,
            ...overrides.publications,
        },
    };
}
