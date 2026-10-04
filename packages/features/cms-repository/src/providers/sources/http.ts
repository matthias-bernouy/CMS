import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { repositoryBaseUrl } from "cms-repository/repository-http/baseUrl";
import { readCataloguePages } from "cms-repository/repository-http/cataloguePages";
import { getRepositoryBytes, MAX_REPOSITORY_RESPONSE_BYTES } from "cms-repository/repository-http/getBytes";
import type {
    ProviderRepositorySource,
    RepositoryArtifactEntry,
    RepositoryArtifactKind,
    RepositoryArtifactReference,
} from "./interfaces";
import { parseProviderCataloguePage, validProviderReference, validProviderRepositoryId } from "./parseCatalogue";

const CATALOGUE_PAGE_SIZE = 256;

export class HttpProviderRepository implements ProviderRepositorySource {
    readonly id: string;
    private readonly base: URL;

    constructor(id: string, baseUrl: string) {
        if (!validProviderRepositoryId(id)) {
            throw new TypeError("Invalid provider repository ID");
        }
        this.id = id;
        this.base = repositoryBaseUrl(baseUrl, "Provider");
    }

    async list(kind: RepositoryArtifactKind): Promise<readonly RepositoryArtifactEntry[]> {
        return readCataloguePages(
            async (cursor) => {
                const query = cursor
                    ? `?limit=${CATALOGUE_PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`
                    : `?limit=${CATALOGUE_PAGE_SIZE}`;
                const bytes = await getRepositoryBytes(this.base, `v1/${pathKind(kind)}${query}`, "Provider");
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

    async get(reference: RepositoryArtifactReference): Promise<Uint8Array> {
        if (!validProviderReference(reference)) {
            throw new TypeError("Invalid provider repository reference");
        }
        return getRepositoryBytes(
            this.base,
            `v1/${pathKind(reference.kind)}/${encodeURIComponent(reference.publisherId)}/${encodeURIComponent(reference.id)}/${encodeURIComponent(reference.version)}`,
            "Provider",
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
