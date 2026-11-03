import { RepositoryDiscoveryError, discoveryFailure } from "./errors";
import { RepositorySearchCorpus } from "./corpus";
import { VectorIndex, within } from "@bernouy/text-search";
import type { Embeddings } from "@bernouy/text-search";
import { sha256Digest } from "@bernouy/binary-media";
import type { RepositorySearchSource, RepositorySearchVectorStore } from "../interfaces";
import { searchQuery } from "./input";
import { rankRows, searchRows } from "./ranking";

export class RepositorySearch {
    private readonly vectors?: VectorIndex;
    private readonly corpus: RepositorySearchCorpus;
    private active = 0;
    private closed = false;
    private preparing?: Promise<unknown>;
    constructor(source: RepositorySearchSource, model?: Embeddings, store?: RepositorySearchVectorStore) {
        this.corpus = new RepositorySearchCorpus(source);
        if (model) {
            this.vectors = new VectorIndex(model, store);
        }
    }
    prepare(signal?: AbortSignal): Promise<unknown> {
        if (this.closed) {
            return Promise.reject(new RepositoryDiscoveryError("CORE_UNAVAILABLE", "Repository search unavailable"));
        }
        this.preparing ??= this.prepareCurrent(signal).finally(() => {
            this.preparing = undefined;
        });
        return this.preparing;
    }
    private async prepareCurrent(signal?: AbortSignal) {
        const snapshot = await this.corpus.load();
        return this.vectors?.prepare(
            snapshot.revision,
            snapshot.rows.map((row) => row.text.slice(0, 4096).toWellFormed()),
            signal,
        );
    }
    async search(value: unknown) {
        const input = searchQuery(value);
        if (this.closed || this.active >= 8) {
            throw new RepositoryDiscoveryError("CORE_UNAVAILABLE", "Repository search unavailable");
        }
        this.active++;
        try {
            const snapshot = await this.corpus.load();
            const rows = searchRows(snapshot.rows, input);
            const vectors = this.vectors?.get(snapshot.revision);
            let embedding: readonly number[] | undefined;
            if (vectors && rows.length) {
                embedding = await within(this.vectors!.query(input.query), 1000).catch(() => undefined);
            } else if (this.vectors && !this.preparing) {
                void this.prepare().catch(() => undefined);
            }
            const positions = new Map(snapshot.rows.map((row, index) => [row, index]));
            const ranking = rankRows(
                rows,
                input.query,
                embedding ? rows.map((row) => vectors![positions.get(row)!]!) : undefined,
                embedding,
            );
            const key = await sha256Digest(
                new TextEncoder().encode(
                    JSON.stringify({
                        revision: snapshot.revision,
                        ...input,
                        cursor: undefined,
                        limit: undefined,
                        mode: embedding ? "hybrid" : "lexical",
                    }),
                ),
            );
            let offset = 0;
            if (input.cursor) {
                const match = /^([a-f0-9]{64}):(\d{1,5})$/u.exec(input.cursor);
                if (!match || match[1] !== key.slice(7)) {
                    throw new RepositoryDiscoveryError(
                        "REVISION_CONFLICT",
                        "Repository search cursor expired; restart the search",
                    );
                }
                offset = Number(match[2]);
                if (offset > ranking.length) {
                    throw new RepositoryDiscoveryError("INVALID_INPUT", "Invalid repository search cursor");
                }
            }
            const next = offset + input.limit!;
            const results = ranking.slice(offset, next).map((index) => {
                const { text: _text, ...result } = rows[index]!;
                return structuredClone(result);
            });
            if ((await this.corpus.load()).revision !== snapshot.revision) {
                throw new RepositoryDiscoveryError(
                    "REVISION_CONFLICT",
                    "Repository catalogue changed; restart the search",
                );
            }
            return {
                revision: snapshot.revision,
                mode: embedding ? ("hybrid" as const) : ("lexical" as const),
                degraded: !embedding,
                results,
                ...(next < ranking.length ? { nextCursor: `${key.slice(7)}:${next}` } : {}),
            };
        } catch (error) {
            throw discoveryFailure(error);
        } finally {
            this.active--;
        }
    }
    async close() {
        this.closed = true;
        await this.vectors?.close();
        await this.preparing?.catch(() => undefined);
    }
}
