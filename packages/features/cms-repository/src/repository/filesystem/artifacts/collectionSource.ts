import {
    parseCollectionCataloguePage,
    validCollectionReference,
    validCollectionRepositoryId,
} from "cms-repository/collections/sources/parseCatalogue";
import type {
    CollectionRepositorySource,
    CollectionRepositoryEntry,
    CollectionRepositoryReference,
} from "cms-repository/exports/collections/sources";
import { FilesystemRepositoryCatalogueIndex } from "../catalogueIndex";
import { LocalCollectionRepository } from "./collections";

/** Metadata does not hydrate assets; complete reads use normal immutable asset admission. */
export class FilesystemCollectionRepository implements CollectionRepositorySource {
    private readonly collections: LocalCollectionRepository;
    constructor(
        readonly id: string,
        root: string,
        private readonly index = new FilesystemRepositoryCatalogueIndex(root),
    ) {
        if (!validCollectionRepositoryId(id)) {
            throw new TypeError("Invalid collection repository ID");
        }
        this.collections = new LocalCollectionRepository(root);
    }

    async list(): Promise<CollectionRepositoryEntry[]> {
        const rows = await this.index.list("collections");
        if (rows.length > 4096) {
            throw new Error("Local collection catalogue budget exceeded");
        }
        const entries: CollectionRepositoryEntry[] = [];
        for (let offset = 0; offset < rows.length; offset += 256) {
            entries.push(
                ...parseCollectionCataloguePage({ releases: rows.slice(offset, offset + 256) }, this.id).entries,
            );
        }
        return entries;
    }

    async getMetadata(reference: CollectionRepositoryReference): Promise<unknown> {
        this.assertReference(reference);
        const artifact = await this.collections.getMetadata(
            reference.publisherId,
            reference.collectionId,
            reference.version,
        );
        if (!artifact || artifact.digest !== reference.digest) {
            throw new Error("Local collection identity or digest mismatch");
        }
        return structuredClone(artifact.release);
    }

    async get(reference: CollectionRepositoryReference) {
        await this.getMetadata(reference);
        const artifact = await this.collections.get(reference.publisherId, reference.collectionId, reference.version);
        if (!artifact || artifact.digest !== reference.digest) {
            throw new Error("Local collection identity or digest mismatch");
        }
        return { release: structuredClone(artifact.release), assets: artifact.assets };
    }

    private assertReference(reference: CollectionRepositoryReference) {
        if (!validCollectionReference(reference)) {
            throw new TypeError("Invalid collection repository reference");
        }
    }
}
