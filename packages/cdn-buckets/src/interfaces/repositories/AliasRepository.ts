import type { Alias } from "../entities/Alias";

export interface AliasRepository {
    create(alias: Alias): Promise<void>;
    getByDomain(domain: string): Promise<Alias | null>;
    listByBucket(bucketId: string): Promise<Alias[]>;
    /** Used by the Nginx map regenerator — needs every alias in one shot. */
    list(): Promise<Alias[]>;
    delete(domain: string): Promise<void>;
}
