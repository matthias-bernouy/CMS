import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { DEFAULT_COLLECTION_LIMITS } from "cms-repository/collections/core/limits";
import { parseCollectionRelease } from "cms-repository/collections/core/parsing/parseCollectionRelease";
import { verifyStoredCollectionRelease } from "cms-repository/collections/core/admission/collectionArtifact";
import { repositoryBaseUrl } from "cms-repository/repository-http/baseUrl";
import { registryCataloguePage } from "cms-repository/repository-http/catalogueValues";
import { readCataloguePages } from "cms-repository/repository-http/cataloguePages";
import {
    getRepositoryBytes,
    MAX_REPOSITORY_RESPONSE_BYTES,
    type RepositoryFetch,
} from "cms-repository/repository-http/getBytes";
import type {
    CollectionRepositoryEntry,
    CollectionRepositoryReference,
    CollectionRepositorySource,
} from "./interfaces";
import { parseCollectionCataloguePage, validCollectionReference, validCollectionRepositoryId } from "./parseCatalogue";

const ASSET_FETCH_CONCURRENCY = 4;
const CATALOGUE_PAGE_SIZE = 256;

export type HttpCollectionRepositoryOptions = Readonly<{
    request?: RepositoryFetch;
    allowInsecureHttp?: boolean;
}>;

export class HttpCollectionRepository implements CollectionRepositorySource {
    readonly id: string;
    private readonly base: URL;

    constructor(id: string, baseUrl: string, options: HttpCollectionRepositoryOptions = {}) {
        if (!validCollectionRepositoryId(id)) {
            throw new TypeError("Invalid collection repository ID");
        }
        this.id = id;
        this.base = repositoryBaseUrl(baseUrl, "Collection", options);
        this.request = options.request;
    }

    private readonly request?: RepositoryFetch;

    async list(): Promise<CollectionRepositoryEntry[]> {
        return readCataloguePages(
            async (cursor) => {
                const bytes = await getRepositoryBytes(this.base, "v1/catalogue", "Collection", {
                    request: this.request,
                    query: { kind: "collection", limit: CATALOGUE_PAGE_SIZE, ...(cursor ? { cursor } : {}) },
                });
                return parseCollectionCataloguePage(
                    registryCataloguePage(
                        parseStrictJson(bytes, MAX_REPOSITORY_RESPONSE_BYTES, 64),
                        "collection",
                        "collectionId",
                    ),
                    this.id,
                );
            },
            (entry) => `${entry.publisherId}\0${entry.collectionId}\0${entry.version}`,
            "collection",
        );
    }

    async getMetadata(reference: CollectionRepositoryReference) {
        if (!validCollectionReference(reference)) {
            throw new TypeError("Invalid repository reference");
        }
        const bytes = await getRepositoryBytes(
            this.base,
            `v1/releases/collection/${encodeURIComponent(reference.publisherId)}/${encodeURIComponent(reference.collectionId)}/${encodeURIComponent(reference.version)}`,
            "Collection",
            { request: this.request },
        );
        return parseStrictJson(bytes, MAX_REPOSITORY_RESPONSE_BYTES, 64);
    }

    async get(reference: CollectionRepositoryReference, options?: { readonly maxAssetBytes: number }) {
        const metadata = await this.getMetadata(reference);
        const release = options
            ? (await verifyStoredCollectionRelease(metadata, reference.digest)).release
            : parseCollectionRelease(metadata);
        if (
            options &&
            (!Number.isSafeInteger(options.maxAssetBytes) ||
                options.maxAssetBytes < 0 ||
                release.assets.reduce((sum, asset) => sum + asset.byteLength, 0) > options.maxAssetBytes)
        ) {
            throw new TypeError("Collection asset download exceeds its aggregate byte limit");
        }
        const assets = new Array<{ id: string; bytes: Uint8Array }>(release.assets.length);
        let nextIndex = 0;
        const fetchAsset = async () => {
            while (nextIndex < release.assets.length) {
                const index = nextIndex++;
                const asset = release.assets[index]!;
                const assetBytes = await getRepositoryBytes(
                    this.base,
                    `v1/assets/collection/${encodeURIComponent(reference.publisherId)}/${encodeURIComponent(reference.collectionId)}/${encodeURIComponent(reference.version)}/${encodeURIComponent(asset.id)}`,
                    "Collection asset",
                    {
                        maxBytes: Math.min(asset.byteLength, DEFAULT_COLLECTION_LIMITS.maxAssetBytes),
                        accept: asset.mediaType,
                        request: this.request,
                    },
                );
                assets[index] = { id: asset.id, bytes: assetBytes };
            }
        };
        await Promise.all(Array.from({ length: Math.min(ASSET_FETCH_CONCURRENCY, release.assets.length) }, fetchAsset));
        return { release, assets };
    }
}
