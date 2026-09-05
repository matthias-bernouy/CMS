import type { SourceRepository, SourceSchemaInvalidationScope } from "cms-sources/interfaces/SourceRepository";
import type { Source, SourceEndpoint } from "cms-sources/interfaces/Source";
import { validateSource } from "cms-sources/core/validation/validateSource";
import { SourceValidationError } from "cms-sources/core/model/errors";
import type { SourceTargetUrlValidationOptions } from "cms-sources/core/upstream/sourceTargetUrl";
import { readPersistedSource } from "cms-sources/core/repositories/persistedSource";

/**
 * Decorator that runs `validateSource` on every write before delegating — the
 * unbypassable barrier so no writer (admin API, seed, CLI, …) can store an
 * invalid source. Reads and deletes pass straight through.
 *
 *   `new ValidatingSourceRepository(new MongoSourceRepository(db))`
 */
export class ValidatingSourceRepository implements SourceRepository {
    readonly getEndpointForAuthorization?: (urn: string) => Promise<SourceEndpoint | null>;
    readonly invalidateSchema?: (scope?: SourceSchemaInvalidationScope) => void;

    constructor(
        private readonly inner: SourceRepository,
        private readonly targetOptions: SourceTargetUrlValidationOptions = {},
    ) {
        if (inner.getEndpointForAuthorization) {
            this.getEndpointForAuthorization = (urn: string) => inner.getEndpointForAuthorization!(urn);
        }
        if (inner.invalidateSchema) {
            this.invalidateSchema = (scope) => inner.invalidateSchema!(scope);
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
        const errors = validateSource(source, this.targetOptions);
        if (errors.length) {
            throw new SourceValidationError("source", errors.join("; "));
        }
    }

    deleteSource(urn: string) {
        return this.inner.deleteSource(urn);
    }
    getSource(urn: string) {
        return this.inner.getSource(urn);
    }
    getPersistedSource(urn: string) {
        return readPersistedSource(this.inner, urn);
    }
    getAllSources() {
        return this.inner.getAllSources();
    }
    getEndpoint(urn: string) {
        return this.inner.getEndpoint(urn);
    }
}
