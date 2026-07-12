import type { SourceRepository } from "../interfaces/SourceRepository";
import type { Source, SourceEndpoint } from "../interfaces/Source";
import { validateSource } from "./validateSource";
import { SourceValidationError } from "./errors";

/**
 * Decorator that runs `validateSource` on every write before delegating — the
 * unbypassable barrier so no writer (admin API, seed, CLI, …) can store an
 * invalid source. Reads and deletes pass straight through.
 *
 *   `new ValidatingSourceRepository(new MongoSourceRepository(db))`
 */
export class ValidatingSourceRepository implements SourceRepository {
    readonly getEndpointForAuthorization?: (urn: string) => Promise<SourceEndpoint | null>;

    constructor(private readonly inner: SourceRepository) {
        if (inner.getEndpointForAuthorization) {
            this.getEndpointForAuthorization = (urn: string) => inner.getEndpointForAuthorization!(urn);
        }
    }

    async createSource(source: Source): Promise<Source> {
        this.validate(source);
        return this.inner.createSource(source);
    }

    async updateSource(source: Source): Promise<Source | null> {
        this.validate(source);
        return this.inner.updateSource(source);
    }

    private validate(source: Source): void {
        const errors = validateSource(source);
        if (errors.length) throw new SourceValidationError("source", errors.join("; "));
    }

    deleteSource(urn: string)  { return this.inner.deleteSource(urn); }
    getSource(urn: string)     { return this.inner.getSource(urn); }
    getAllSources()            { return this.inner.getAllSources(); }
    getEndpoint(urn: string)     { return this.inner.getEndpoint(urn); }
}
