import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { repositoryBaseUrl } from "cms-repository/repository-http/baseUrl";
import { getRepositoryBytes, MAX_REPOSITORY_RESPONSE_BYTES } from "cms-repository/repository-http/getBytes";
import type {
    ProviderRepositorySource,
    RepositoryArtifactEntry,
    RepositoryArtifactKind,
    RepositoryArtifactReference,
} from "./interfaces";
import { parseProviderCatalogue, validProviderReference, validProviderRepositoryId } from "./parseCatalogue";

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
        const bytes = await getRepositoryBytes(this.base, `v1/${pathKind(kind)}`, "Provider");
        return parseProviderCatalogue(parseStrictJson(bytes, MAX_REPOSITORY_RESPONSE_BYTES, 64), this.id, kind);
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
