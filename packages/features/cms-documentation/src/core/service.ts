import type {
    DocumentationEmbeddings,
    DocumentationSource,
    DocumentationVectorStore,
} from "../interfaces/Documentation";
import { DocumentationError, integer, record, text } from "./input";
import { corpusKey, DocumentationCorpus } from "./corpus";
import { fusedRanking, lexicalRanking, rankedDocuments, semanticRanking } from "./ranking";
import { VectorIndex, within } from "./vectors";
import { readDocument } from "./read";

/** Selection-scoped retrieval; preparation is an explicit runtime operation. */
export class CmsDocumentation {
    private readonly corpus: DocumentationCorpus;
    private readonly vectors?: VectorIndex;
    private preparing?: Promise<{
        revision: string;
        chunks: number;
        semantic: boolean;
        embedded: number;
        reused: number;
    }>;
    private nextHintAt = 0;
    private closed = false;
    private searches = 0;
    private reads = 0;
    constructor(
        private readonly source: DocumentationSource,
        model?: DocumentationEmbeddings,
        store?: DocumentationVectorStore,
        private readonly semanticTimeoutMs = 10_000,
        private readonly requestPreparation?: () => void,
    ) {
        this.corpus = new DocumentationCorpus(source);
        if (model) {
            this.vectors = new VectorIndex(model, store);
        }
    }

    prepare(signal?: AbortSignal) {
        if (this.closed) {
            return Promise.reject(new DocumentationError("CORE_UNAVAILABLE"));
        }
        this.preparing ??= this.prepareCurrent(signal).finally(() => {
            this.preparing = undefined;
        });
        return this.preparing;
    }

    private async prepareCurrent(signal?: AbortSignal) {
        signal?.throwIfAborted();
        const scope = await this.source.resolve();
        const chunks = await this.corpus.load(scope);
        const counts = await this.vectors?.prepare(corpusKey(scope), chunks, signal);
        if (!(await this.source.isCurrent(scope.revision))) {
            throw new DocumentationError("REVISION_CONFLICT");
        }
        return {
            revision: scope.revision,
            chunks: chunks.length,
            semantic: Boolean(this.vectors),
            embedded: counts?.embedded ?? 0,
            reused: counts?.reused ?? 0,
        };
    }

    async search(input: unknown) {
        const value = record(input, ["query", "contractId", "capabilityId", "limit"]);
        const query = text(value.query, 2048);
        const contract = value.contractId === undefined ? undefined : text(value.contractId);
        const capability = value.capabilityId === undefined ? undefined : text(value.capabilityId);
        const limit = integer(value.limit, 5, 1, 10);
        if (this.closed || this.searches >= 16) {
            throw new DocumentationError("CORE_UNAVAILABLE");
        }
        this.searches++;
        try {
            const scope = await this.source.resolve();
            const all = await this.corpus.load(scope);
            const indices = all.flatMap((chunk, index) =>
                (!contract || chunk.reference.contractId === contract) &&
                (!capability || chunk.capabilities.includes(capability))
                    ? [index]
                    : [],
            );
            const chunks = indices.map((index) => all[index]!);
            const lexical = lexicalRanking(chunks, query);
            let ranking = lexical;
            let mode: "hybrid" | "lexical" = "lexical";
            const vectors = this.vectors?.get(corpusKey(scope));
            if (vectors && chunks.length) {
                try {
                    const question = await within(this.vectors!.query(query), this.semanticTimeoutMs);
                    ranking = fusedRanking(
                        lexical,
                        semanticRanking(
                            indices.map((index) => vectors[index]!),
                            question,
                        ),
                    );
                    mode = "hybrid";
                } catch {
                    /* A bounded, explicit lexical fallback remains available. */
                }
            } else if (this.vectors && chunks.length && Date.now() >= this.nextHintAt) {
                this.nextHintAt = Date.now() + 30_000;
                try {
                    this.requestPreparation?.();
                } catch {
                    /* Scheduling is advisory and must not fail a lookup. */
                }
            }
            if (this.closed || !(await this.source.isCurrent(scope.revision))) {
                throw new DocumentationError("REVISION_CONFLICT");
            }
            return { mode, degraded: mode !== "hybrid", results: rankedDocuments(chunks, ranking, limit) };
        } finally {
            this.searches--;
        }
    }

    async get(input: unknown) {
        if (this.closed || this.reads >= 16) {
            throw new DocumentationError("CORE_UNAVAILABLE");
        }
        this.reads++;
        try {
            return await readDocument(this.source, await this.source.resolve(), input);
        } finally {
            this.reads--;
        }
    }

    async close(): Promise<void> {
        this.closed = true;
        await this.vectors?.close();
        await this.preparing?.catch(() => undefined);
        await this.corpus.close();
    }
}
