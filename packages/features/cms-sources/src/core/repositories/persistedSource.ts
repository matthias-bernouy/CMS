import type { Source } from "cms-sources/interfaces/Source";
import type { SourceRepository } from "cms-sources/interfaces/SourceRepository";

/** Reads the storage-authoritative Source while bypassing derived repository projections. */
export async function readPersistedSource(repository: SourceRepository, urn: string): Promise<Source | null> {
    return repository.getPersistedSource(urn);
}
