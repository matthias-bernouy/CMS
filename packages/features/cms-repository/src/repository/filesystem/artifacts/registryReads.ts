import { RepositoryRequestError } from "../../core/errors";
import type { RepositoryCapabilityPorts } from "../../capabilities/interfaces";
import type { RemoteCoordinate } from "../../publication/types";
import type { FilesystemRepositoryCatalogueIndex } from "../catalogueIndex";
import { cataloguePage, CatalogueInputError } from "../core/catalogue";
import { LocalArtifactFiles } from "./files";
import { LocalCollectionRepository } from "./collections";
import { LocalContractReleases } from "../contracts";
import { LocalProviderReleases } from "../providers";

/** Uses the same immutable metadata and asset validation as local installation and publication. */
export class FilesystemRegistryReads {
    private readonly collections: LocalCollectionRepository;
    private readonly contracts: LocalContractReleases;
    private readonly providers: LocalProviderReleases;

    constructor(
        root: string,
        private readonly index: FilesystemRepositoryCatalogueIndex,
    ) {
        this.collections = new LocalCollectionRepository(root);
        this.contracts = new LocalContractReleases(new LocalArtifactFiles(root));
        this.providers = new LocalProviderReleases(new LocalArtifactFiles(root), this.contracts);
    }

    async catalogue(input: Parameters<RepositoryCapabilityPorts["catalogue"]>[0]) {
        try {
            const type =
                input.kind === "collection" ? "collections" : input.kind === "contract" ? "contracts" : "providers";
            const page = await cataloguePage(type, this.index, String(input.limit), input.cursor ?? null, false, input);
            return {
                releases: page.releases.map((entry) => {
                    const { publisherId, collectionId, contractId, providerId, version, digest, ...metadata } = entry;
                    const id = collectionId ?? contractId ?? providerId;
                    if (!id) {
                        throw new RepositoryRequestError("REJECTED", "Invalid catalogue coordinate");
                    }
                    return { kind: input.kind, publisherId, id, version, digest, metadata: definedMetadata(metadata) };
                }),
                ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
            };
        } catch (error) {
            if (error instanceof CatalogueInputError) {
                throw new RepositoryRequestError("REJECTED", "Invalid catalogue pagination");
            }
            throw error;
        }
    }

    async release(coordinate: RemoteCoordinate) {
        const { publisherId, id, version } = coordinate;
        const metadata = await (coordinate.kind === "collection"
            ? this.collections.getMetadata(publisherId, id, version)
            : coordinate.kind === "contract"
              ? this.contracts.getMetadata(publisherId, id, version)
              : this.providers.getMetadata(publisherId, id, version));
        if (!metadata) {
            return null;
        }
        const bytes = new Blob([metadata.canonicalJson]);
        return {
            stream: bytes.stream(),
            contentLength: bytes.size,
            contentType: "application/json",
            digest: metadata.digest,
        };
    }

    async asset(coordinate: RemoteCoordinate, assetId: string) {
        const { publisherId, id, version } = coordinate;
        if (coordinate.kind === "provider-manifest") {
            return null;
        }
        const asset = await (coordinate.kind === "collection"
            ? this.collections.getAsset(publisherId, id, version, assetId)
            : assetId.startsWith("docs/")
              ? this.contracts.getDocumentation(publisherId, id, version, assetId.slice(5))
              : this.contracts.getFixture(publisherId, id, version, assetId));
        return asset
            ? {
                  stream: asset.bytes.stream(),
                  contentLength: asset.definition.byteLength,
                  contentType: "application/octet-stream",
                  digest: asset.definition.digest,
              }
            : null;
    }
}

/** Preserve the inferred metadata shape while omitting absent optional wire fields. */
function definedMetadata<Value extends object>(value: Value): Value {
    const result = { ...value };
    for (const [key, entry] of Object.entries(result)) {
        if (entry === undefined) {
            Reflect.deleteProperty(result, key);
        }
    }
    return result;
}
