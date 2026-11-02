import { documentationPath } from "cms-repository/exports/contracts/documentation";
import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { repositoryBaseUrl } from "cms-repository/repository-http/baseUrl";
import { readCataloguePages } from "cms-repository/repository-http/cataloguePages";
import {
    getRepositoryBytes,
    MAX_REPOSITORY_RESPONSE_BYTES,
    type RepositoryFetch,
} from "cms-repository/repository-http/getBytes";
import type {
    ProviderRepositorySource,
    RepositoryArtifactEntry,
    RepositoryArtifactKind,
    RepositoryArtifactReference,
} from "./interfaces";
import { parseProviderCataloguePage, validProviderReference, validProviderRepositoryId } from "./parseCatalogue";

const CATALOGUE_PAGE_SIZE = 256;

export type HttpProviderRepositoryOptions = Readonly<{
    request?: RepositoryFetch;
    allowInsecureHttp?: boolean;
}>;

export class HttpProviderRepository implements ProviderRepositorySource {
    readonly id: string;
    private readonly base: URL;

    constructor(id: string, baseUrl: string, options: HttpProviderRepositoryOptions = {}) {
        if (!validProviderRepositoryId(id)) {
            throw new TypeError("Invalid provider repository ID");
        }
        this.id = id;
        this.base = repositoryBaseUrl(baseUrl, "Provider", options);
        this.request = options.request;
    }

    private readonly request?: RepositoryFetch;

    async list(kind: RepositoryArtifactKind): Promise<readonly RepositoryArtifactEntry[]> {
        return readCataloguePages(
            async (cursor) => {
                const query = cursor
                    ? `?limit=${CATALOGUE_PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`
                    : `?limit=${CATALOGUE_PAGE_SIZE}`;
                const bytes = await getRepositoryBytes(this.base, `v1/${pathKind(kind)}${query}`, "Provider", {
                    request: this.request,
                });
                return parseProviderCataloguePage(
                    parseStrictJson(bytes, MAX_REPOSITORY_RESPONSE_BYTES, 64),
                    this.id,
                    kind,
                );
            },
            (entry) => `${entry.publisherId}\0${entry.id}\0${entry.version}`,
            "provider",
        );
    }

    async getAsset(reference: RepositoryArtifactReference, assetId: string, maxBytes: number): Promise<Uint8Array> {
        if (!validProviderReference(reference) || reference.kind !== "contract" || !assetId.startsWith("docs/")) {
            throw new TypeError("Invalid documentation asset reference");
        }
        const path = documentationPath(assetId.slice(5));
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 128 * 1024) {
            throw new TypeError("Invalid documentation byte budget");
        }
        return getRepositoryBytes(
            this.base,
            `v1/contracts/${encodeURIComponent(reference.publisherId)}/${encodeURIComponent(reference.id)}/${encodeURIComponent(reference.version)}/docs/${encodeURIComponent(path)}`,
            "Documentation",
            { request: this.request, accept: "text/markdown", maxBytes },
        );
    }

    async get(reference: RepositoryArtifactReference): Promise<Uint8Array> {
        if (!validProviderReference(reference)) {
            throw new TypeError("Invalid provider repository reference");
        }
        return getRepositoryBytes(
            this.base,
            `v1/${pathKind(reference.kind)}/${encodeURIComponent(reference.publisherId)}/${encodeURIComponent(reference.id)}/${encodeURIComponent(reference.version)}`,
            "Provider",
            { request: this.request },
        );
    }
}

function pathKind(kind: RepositoryArtifactKind): "contracts" | "providers" {
    if (kind === "contract") {
        return "contracts";
    }
    if (kind === "provider-manifest") {
        return "providers";
    }
    throw new TypeError("Invalid provider repository kind");
}
