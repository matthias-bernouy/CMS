import type { SourceRepository } from "../interfaces/SourceRepository";
import type { Source, SourceEndpoint } from "../interfaces/Source";
import { DuplicateSourceError } from "../core/model/errors";

/**
 * In-memory implementation of `SourceRepository` — the dep-free default, for
 * dev and tests. Defensive cloning (`structuredClone`) on input and output:
 * stored data is plain JSON, so cloning is safe.
 */
export class InMemorySourceRepository implements SourceRepository {
    private _sources = new Map<string, Source>(); // keyed by source.urn

    async createSource(source: Source): Promise<Source> {
        if (this._sources.has(source.urn)) {
            throw new DuplicateSourceError(source.urn);
        }
        this._sources.set(source.urn, structuredClone(source));
        return structuredClone(source);
    }

    async updateSource(source: Source): Promise<Source | null> {
        if (!this._sources.has(source.urn)) {
            return null;
        }
        this._sources.set(source.urn, structuredClone(source));
        return structuredClone(source);
    }

    async deleteSource(urn: string): Promise<boolean> {
        return this._sources.delete(urn);
    }

    async getSource(urn: string): Promise<Source | null> {
        const found = this._sources.get(urn);
        return found ? structuredClone(found) : null;
    }

    async getPersistedSource(urn: string): Promise<Source | null> {
        const found = this._sources.get(urn);
        return found ? structuredClone(found) : null;
    }

    async getAllSources(): Promise<Source[]> {
        return Array.from(this._sources.values(), (p) => structuredClone(p));
    }

    async getEndpoint(urn: string): Promise<SourceEndpoint | null> {
        for (const source of this._sources.values()) {
            const endpoint = source.endpoints.find((e) => e.urn === urn);
            if (endpoint) {
                return structuredClone(endpoint);
            }
        }
        return null;
    }
}
