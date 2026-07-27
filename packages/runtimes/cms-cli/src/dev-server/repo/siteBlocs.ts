import {
    archivedSiteDefinition,
    type BlocRecord,
    DuplicateBlocTagError,
    nextDraftDefinition,
    publishedSiteRecord,
    type SiteBlocDefinition,
    type SiteBlocSnapshot,
    SiteBlocNotFoundError,
    type TBlocWrite,
} from "@bernouy/cms-content";
import { generateSiteBlocSource } from "cms-cli/push/blocs/siteBuilder";
import type { BlocsStore } from "./blocs";

export type LocalSiteBlocPublicationGuard = {
    assertHeld(): Promise<void>;
};

const MUTATION_QUEUES = new Map<string, Promise<void>>();
const LOCAL_PUBLICATION_GUARD: LocalSiteBlocPublicationGuard = {
    assertHeld: () => Promise.resolve(),
};

export class SiteBlocsStore {
    constructor(private readonly blocs: BlocsStore) {}

    create(definition: SiteBlocDefinition): Promise<BlocRecord> {
        return this.mutate(definition.tag, async () => {
            if (await this.blocs.getRecord(definition.tag)) {
                throw new DuplicateBlocTagError(definition.tag);
            }
            await this.blocs.writeDefinition(null, definition);
            return {
                tag: definition.tag,
                ownership: structuredClone(definition.ownership),
                artifact: null,
                siteDefinition: structuredClone(definition),
            };
        });
    }

    saveDraft(tag: string, draft: SiteBlocSnapshot, expectedRevision: number): Promise<SiteBlocDefinition> {
        return this.mutate(tag, async () => {
            const current = await this.requiredRecord(tag);
            const definition = nextDraftDefinition(current, draft, expectedRevision);
            await this.blocs.writeDefinition(current, definition);
            return structuredClone(definition);
        });
    }

    publish(tag: string, artifact: TBlocWrite, expectedRevision: number, publicationDate?: Date): Promise<BlocRecord> {
        return this.mutate(tag, async () => {
            const current = await this.requiredRecord(tag);
            const publication = publishedSiteRecord(current, artifact, expectedRevision, publicationDate);
            const definition = publication.siteDefinition!;
            const source = generateSiteBlocSource(definition);
            const builtArtifact = await this.blocs.writeArtifact({ ...publication.artifact!, source }, definition);
            return {
                tag,
                ownership: structuredClone(definition.ownership),
                artifact: builtArtifact,
                siteDefinition: structuredClone(definition),
            };
        });
    }

    setArchived(tag: string, archived: boolean, expectedRevision: number): Promise<SiteBlocDefinition> {
        return this.mutate(tag, async () => {
            const current = await this.requiredRecord(tag);
            const definition = archivedSiteDefinition(current, archived, expectedRevision);
            await this.blocs.writeDefinition(current, definition);
            return structuredClone(definition);
        });
    }

    withPublicationLock<T>(operation: (guard: LocalSiteBlocPublicationGuard) => Promise<T>): Promise<T> {
        return serialize(this.blocs.serializationKey("site-bloc-publication"), () =>
            operation(LOCAL_PUBLICATION_GUARD),
        );
    }

    private async requiredRecord(tag: string): Promise<BlocRecord> {
        const record = await this.blocs.getRecord(tag);
        if (!record) {
            throw new SiteBlocNotFoundError(tag);
        }
        return record;
    }

    private mutate<T>(tag: string, operation: () => Promise<T>): Promise<T> {
        return serialize(this.blocs.serializationKey(`site-bloc:${tag}`), operation);
    }
}

function serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = MUTATION_QUEUES.get(key) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const settled = result.then(
        () => undefined,
        () => undefined,
    );
    MUTATION_QUEUES.set(key, settled);
    return result.finally(() => {
        if (MUTATION_QUEUES.get(key) === settled) {
            MUTATION_QUEUES.delete(key);
        }
    });
}
