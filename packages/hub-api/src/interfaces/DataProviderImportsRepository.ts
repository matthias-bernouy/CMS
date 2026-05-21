import type { DataProviderImport } from "./DataProviderImport";

/**
 * Where the hub persists its meta-registry of imported data-providers.
 * Pure interface — implementations: `MemoryDataProviderImportsRepository`
 * (tests + dev) and `MongoDataProviderImportsRepository` (prod).
 */
export interface DataProviderImportsRepository {
    list(): Promise<DataProviderImport[]>;
    getByProviderId(providerId: string): Promise<DataProviderImport | null>;
    getByUrl(url: string):               Promise<DataProviderImport | null>;
    getByIss(iss: string):               Promise<DataProviderImport | null>;
    /** Insert; throws on conflict (providerId / url / iss already taken). */
    insert(doc: DataProviderImport):     Promise<DataProviderImport>;
    /** Refresh the schemas + cachedAt of an existing import. */
    updateSchemas(
        providerId: string,
        schemas:    DataProviderImport["schemas"],
        cachedAt:   Date,
    ): Promise<DataProviderImport | null>;
    /** Remove. Returns `true` if a row was removed, `false` if absent. */
    remove(providerId: string): Promise<boolean>;
}
