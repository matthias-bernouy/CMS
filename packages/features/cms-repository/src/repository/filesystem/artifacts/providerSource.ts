import { documentationPath } from "cms-repository/exports/contracts/documentation";
import {
    parseProviderCataloguePage,
    validProviderReference,
    validProviderRepositoryId,
} from "cms-repository/providers/sources/parseCatalogue";
import type {
    ProviderRepositorySource,
    RepositoryArtifactKind,
    RepositoryArtifactReference,
} from "cms-repository/exports/providers/sources";
import { FilesystemRepositoryCatalogueIndex } from "../catalogueIndex";
import { LocalContractReleases } from "../contracts";
import { LocalProviderReleases } from "../providers";
import { LocalArtifactFiles } from "./files";

/** Read-only admitted artifacts; shares the same catalogue and verification as the registry. */
export class FilesystemProviderRepository implements ProviderRepositorySource {
    private readonly contracts: LocalContractReleases;
    private readonly providers: LocalProviderReleases;
    constructor(
        readonly id: string,
        root: string,
        private readonly index = new FilesystemRepositoryCatalogueIndex(root),
    ) {
        if (!validProviderRepositoryId(id)) {
            throw new TypeError("Invalid provider repository ID");
        }
        const files = new LocalArtifactFiles(root);
        this.contracts = new LocalContractReleases(files);
        this.providers = new LocalProviderReleases(files, this.contracts);
    }

    async list(kind: RepositoryArtifactKind) {
        if (kind !== "contract" && kind !== "provider-manifest") {
            throw new TypeError("Invalid provider repository kind");
        }
        const rows = await this.index.list(kind === "contract" ? "contracts" : "providers");
        if (rows.length > 4096) {
            throw new Error("Local artifact catalogue budget exceeded");
        }
        const entries = [];
        for (let offset = 0; offset < rows.length; offset += 256) {
            entries.push(
                ...parseProviderCataloguePage({ releases: rows.slice(offset, offset + 256) }, this.id, kind).entries,
            );
        }
        return entries;
    }

    async get(reference: RepositoryArtifactReference): Promise<Uint8Array> {
        if (!validProviderReference(reference) || !["contract", "provider-manifest"].includes(reference.kind)) {
            throw new TypeError("Invalid provider repository reference");
        }
        const artifact =
            reference.kind === "contract"
                ? await this.contracts.getMetadata(reference.publisherId, reference.id, reference.version)
                : await this.providers.getMetadata(reference.publisherId, reference.id, reference.version);
        if (!artifact || artifact.digest !== reference.digest) {
            throw new Error("Local artifact identity or digest mismatch");
        }
        return new TextEncoder().encode(artifact.canonicalJson);
    }

    async getAsset(reference: RepositoryArtifactReference, assetId: string, maxBytes: number): Promise<Uint8Array> {
        if (
            reference.kind !== "contract" ||
            !assetId.startsWith("docs/") ||
            !Number.isSafeInteger(maxBytes) ||
            maxBytes < 1 ||
            maxBytes > 128 * 1024
        ) {
            throw new TypeError("Invalid local documentation request");
        }
        await this.get(reference);
        const asset = await this.contracts.getDocumentation(
            reference.publisherId,
            reference.id,
            reference.version,
            documentationPath(assetId.slice(5)),
        );
        if (!asset || asset.definition.byteLength > maxBytes) {
            throw new Error("Local documentation is missing or exceeds its byte budget");
        }
        return new Uint8Array(await asset.bytes.arrayBuffer());
    }
}
