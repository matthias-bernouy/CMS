import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { DEFAULT_COLLECTION_LIMITS } from "cms-repository/collections/core/limits";
import { parseCollectionRelease } from "cms-repository/collections/core/parsing/parseCollectionRelease";
import { repositoryBaseUrl } from "cms-repository/repository-http/baseUrl";
import { readCataloguePages } from "cms-repository/repository-http/cataloguePages";
import { getRepositoryBytes, MAX_REPOSITORY_RESPONSE_BYTES } from "cms-repository/repository-http/getBytes";
import type {
    CollectionRepositoryEntry,
    CollectionRepositoryReference,
    CollectionRepositorySource,
} from "./interfaces";
import { parseCollectionCataloguePage, validCollectionReference, validCollectionRepositoryId } from "./parseCatalogue";

const ASSET_FETCH_CONCURRENCY = 4;
const CATALOGUE_PAGE_SIZE = 256;

export class HttpCollectionRepository implements CollectionRepositorySource {
    readonly id: string;
    private readonly base: URL;

    constructor(id: string, baseUrl: string) {
        if (!validCollectionRepositoryId(id)) {
            throw new TypeError("Invalid collection repository ID");
        }
        this.id = id;
        this.base = repositoryBaseUrl(baseUrl, "Collection");
    }

    async list(): Promise<CollectionRepositoryEntry[]> {
        return readCataloguePages(
            async (cursor) => {
                const query = cursor
                    ? `?limit=${CATALOGUE_PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`
                    : `?limit=${CATALOGUE_PAGE_SIZE}`;
                const bytes = await getRepositoryBytes(this.base, `v1/collections${query}`, "Collection");
                return parseCollectionCataloguePage(parseStrictJson(bytes, MAX_REPOSITORY_RESPONSE_BYTES, 64), this.id);
            },
            (entry) => `${entry.publisherId}\0${entry.collectionId}\0${entry.version}`,
            "collection",
        );
    }

    async get(reference: CollectionRepositoryReference) {
        if (!validCollectionReference(reference)) {
            throw new TypeError("Invalid repository reference");
        }
        const bytes = await getRepositoryBytes(
            this.base,
            `v1/collections/${encodeURIComponent(reference.publisherId)}/${encodeURIComponent(reference.collectionId)}/${encodeURIComponent(reference.version)}`,
            "Collection",
        );
        const release = parseCollectionRelease(parseStrictJson(bytes, MAX_REPOSITORY_RESPONSE_BYTES, 64));
        const assets = new Array<{ id: string; bytes: Uint8Array }>(release.assets.length);
        let nextIndex = 0;
        const fetchAsset = async () => {
            while (nextIndex < release.assets.length) {
                const index = nextIndex++;
                const asset = release.assets[index]!;
                const assetBytes = await getRepositoryBytes(
                    this.base,
                    `v1/collections/${encodeURIComponent(reference.publisherId)}/${encodeURIComponent(reference.collectionId)}/${encodeURIComponent(reference.version)}/assets/${encodeURIComponent(asset.id)}`,
                    "Collection asset",
                    {
                        maxBytes: Math.min(asset.byteLength, DEFAULT_COLLECTION_LIMITS.maxAssetBytes),
                        accept: asset.mediaType,
                    },
                );
                assets[index] = { id: asset.id, bytes: assetBytes };
            }
        };
        await Promise.all(Array.from({ length: Math.min(ASSET_FETCH_CONCURRENCY, release.assets.length) }, fetchAsset));
        return { release, assets };
    }
}
