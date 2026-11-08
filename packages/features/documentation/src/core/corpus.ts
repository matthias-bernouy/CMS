import type { DocumentationChunk, DocumentationScope, DocumentationSource } from "../interfaces/Documentation";
import { loadDocuments } from "./documents";
import { DocumentationError } from "./input";

export function corpusKey(scope: DocumentationScope): string {
    return scope.releases
        .map((release) => release.digest)
        .sort()
        .join("|");
}

export class DocumentationCorpus {
    private cached?: { key: string; chunks: readonly DocumentationChunk[] };
    private loading?: { key: string; promise: Promise<readonly DocumentationChunk[]> };
    private closed = false;
    constructor(private readonly source: DocumentationSource) {}

    load(scope: DocumentationScope): Promise<readonly DocumentationChunk[]> {
        const key = corpusKey(scope);
        if (this.closed) {
            return Promise.reject(new DocumentationError("CORE_UNAVAILABLE"));
        }
        if (this.cached?.key === key) {
            return Promise.resolve(this.cached.chunks);
        }
        if (this.loading?.key === key) {
            return this.loading.promise;
        }
        if (this.loading) {
            return Promise.reject(new DocumentationError("CORE_UNAVAILABLE"));
        }
        const promise = loadDocuments(scope, this.source)
            .then((chunks) => {
                this.cached = { key, chunks };
                return chunks;
            })
            .finally(() => {
                this.loading = undefined;
            });
        this.loading = { key, promise };
        return promise;
    }

    async close(): Promise<void> {
        this.closed = true;
        await this.loading?.promise.catch(() => undefined);
        this.cached = undefined;
    }
}
