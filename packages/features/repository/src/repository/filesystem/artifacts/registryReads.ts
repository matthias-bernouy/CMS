import { catalogueListOutputSchema } from "repository/application/registry/schemas/catalogue/listing";
import type { RepositoryCatalogueEntry, RepositoryCatalogueReference } from "../catalogueIndex";
import {
    collectionBrowserRisk,
    collectionBrowserRiskDigest,
    resolveCollectionTranslation,
} from "repository/exports/collections/index";
import type { CollectionVerifier } from "repository/collections/sources/verification";
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
        verifier?: CollectionVerifier,
    ) {
        this.collections = new LocalCollectionRepository(root, verifier);
        this.contracts = new LocalContractReleases(new LocalArtifactFiles(root));
        this.providers = new LocalProviderReleases(new LocalArtifactFiles(root), this.contracts);
    }

    async catalogue(input: Parameters<RepositoryCapabilityPorts["catalogue"]>[0], signal?: AbortSignal) {
        try {
            signal?.throwIfAborted();
            const type =
                input.kind === "collection" ? "collections" : input.kind === "contract" ? "contracts" : "providers";
            const page = await cataloguePage(type, this.index, String(input.limit), input.cursor ?? null, false, input);
            const hydrated = [];
            for (const entry of page.releases) {
                signal?.throwIfAborted();
                hydrated.push(
                    input.kind === "collection" && (input.latestPerResource || input.id !== undefined)
                        ? await this.hydrateCollection(entry, signal)
                        : entry,
                );
            }
            return catalogueListOutputSchema.parse({
                releases: hydrated.map((entry) => {
                    const { publisherId, collectionId, contractId, providerId, version } = entry;
                    const digest = Reflect.get(entry, "digest");
                    const metadata = Object.fromEntries(
                        Object.entries(entry).filter(
                            ([key]) =>
                                ![
                                    "publisherId",
                                    "collectionId",
                                    "contractId",
                                    "providerId",
                                    "version",
                                    "digest",
                                ].includes(key),
                        ),
                    );
                    const id = collectionId ?? contractId ?? providerId;
                    if (!id) {
                        throw new RepositoryRequestError("REJECTED", "Invalid catalogue coordinate");
                    }
                    return { kind: input.kind, publisherId, id, version, digest, metadata: definedMetadata(metadata) };
                }),
                ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
            });
        } catch (error) {
            if (error instanceof CatalogueInputError) {
                throw new RepositoryRequestError("REJECTED", "Invalid catalogue pagination");
            }
            throw error;
        }
    }

    private async hydrateCollection(
        entry: RepositoryCatalogueReference,
        signal?: AbortSignal,
    ): Promise<RepositoryCatalogueEntry> {
        const artifact = await this.collections.getMetadata(
            String(entry.publisherId),
            String(entry.collectionId),
            String(entry.version),
            signal,
        );
        if (!artifact) {
            throw new Error("Collection metadata disappeared during catalogue read");
        }
        const { release, digest } = artifact;
        const browser = collectionBrowserRisk(release);
        return {
            ...entry,
            digest,
            name: resolveCollectionTranslation(release, release.name),
            description: release.description ? resolveCollectionTranslation(release, release.description) : "",
            blocCount: release.blocs.length,
            hasTheme: Boolean(release.theme),
            browserRisk: browser.level,
            browserRiskDigest: collectionBrowserRiskDigest(browser),
            javaScriptBlocCount: browser.javaScriptBlocs.length,
            frameBlocCount: browser.frameBlocs.length,
            externalFrameOrigins: browser.externalFrameOrigins,
            scriptsWithSameOrigin: browser.scriptsWithSameOrigin,
        };
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
