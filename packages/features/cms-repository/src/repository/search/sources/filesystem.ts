import { RepositoryDiscoveryError } from "../core/errors";
import { latestReleaseRows } from "../core/corpus";
import { sha256Digest } from "@bernouy/binary-media";
import { FilesystemRepositoryCatalogueIndex } from "../../filesystem/catalogueIndex";
import type { RepositoryCatalogueEntry } from "../../filesystem/catalogueIndex";
import { LocalCollectionRepository } from "../../filesystem/artifacts/collections";
import { LocalArtifactFiles } from "../../filesystem/artifacts/files";
import { LocalContractReleases } from "../../filesystem/contracts";
import { LocalProviderReleases } from "../../filesystem/providers";
import { collectionRows, contractRow, providerRow } from "./rows";
import type { RepositorySearchSnapshot, RepositorySearchRow } from "../interfaces";

/** Derived metadata only: never reads collection assets or contract documentation bodies. */
export class FilesystemRepositorySearchSource {
    private readonly collections: LocalCollectionRepository;
    private readonly contracts: LocalContractReleases;
    private readonly providers: LocalProviderReleases;
    private current?: {
        catalogues: readonly (readonly RepositoryCatalogueEntry[])[];
        snapshot: RepositorySearchSnapshot;
    };
    private flight?: Promise<RepositorySearchSnapshot>;
    constructor(
        root: string,
        private readonly index: FilesystemRepositoryCatalogueIndex,
    ) {
        const files = new LocalArtifactFiles(root);
        this.collections = new LocalCollectionRepository(root);
        this.contracts = new LocalContractReleases(files);
        this.providers = new LocalProviderReleases(files, this.contracts);
    }
    async load(): Promise<RepositorySearchSnapshot> {
        const catalogues = await Promise.all([
            this.index.list("collections"),
            this.index.list("contracts"),
            this.index.list("providers"),
        ]);
        if (this.current && catalogues.every((catalogue, index) => catalogue === this.current!.catalogues[index])) {
            return this.current.snapshot;
        }
        if (this.flight) {
            await this.flight;
            return this.load();
        }
        this.flight = (async () => {
            const revision = await sha256Digest(new TextEncoder().encode(JSON.stringify(catalogues)));
            if (this.current?.snapshot.revision === revision) {
                this.current = { catalogues, snapshot: this.current.snapshot };
                return this.current.snapshot;
            }
            const snapshot = await this.build(catalogues, revision);
            this.current = { catalogues, snapshot };
            return snapshot;
        })().finally(() => {
            this.flight = undefined;
        });
        return this.flight;
    }
    private async build(
        catalogues: readonly (readonly RepositoryCatalogueEntry[])[],
        revision: string,
    ): Promise<RepositorySearchSnapshot> {
        const kinds = ["collection", "contract", "provider-manifest"] as const;
        const idKeys = ["collectionId", "contractId", "providerId"] as const;
        const selected = catalogues.map((entries, index) =>
            latestReleaseRows(
                entries.map((entry) => ({
                    entry,
                    reference: {
                        kind: kinds[index]!,
                        publisherId: entry.publisherId as string,
                        id: entry[idKeys[index]!] as string,
                        version: entry.version as string,
                        digest: entry.digest as string,
                    },
                })),
            ).map(({ entry }) => entry),
        );
        if (selected.reduce((sum, entries) => sum + entries.length, 0) > 4096) {
            throw new RepositoryDiscoveryError("CATALOGUE_TOO_LARGE", "Repository search release budget exceeded");
        }
        const rows: RepositorySearchRow[] = [];
        let size = 0;
        const append = (items: readonly RepositorySearchRow[]) => {
            for (const row of items) {
                size += JSON.stringify(row).length * 2;
                if (rows.length >= 16384 || size > 32 * 1024 * 1024) {
                    throw new RepositoryDiscoveryError(
                        "CATALOGUE_TOO_LARGE",
                        "Repository search corpus budget exceeded",
                    );
                }
                rows.push(row);
            }
        };
        for (const entry of selected[0]!) {
            const artifact = await this.collections.getMetadata(
                entry.publisherId as string,
                entry.collectionId as string,
                entry.version as string,
            );
            if (!artifact || artifact.digest !== entry.digest) {
                throw new RepositoryDiscoveryError("RELEASE_MISMATCH", "Collection catalogue changed while indexing");
            }
            append(collectionRows(artifact.release, artifact.digest));
        }
        const contractDescriptions = new Map<string, string>();
        for (const entry of selected[1]!) {
            const artifact = await this.contracts.getMetadata(
                entry.publisherId as string,
                entry.contractId as string,
                entry.version as string,
            );
            if (!artifact || artifact.digest !== entry.digest) {
                throw new RepositoryDiscoveryError("RELEASE_MISMATCH", "Contract catalogue changed while indexing");
            }
            contractDescriptions.set(
                `${artifact.release.contractId}\0${artifact.release.version}\0${artifact.digest}`,
                `${artifact.release.name} ${artifact.release.description ?? ""}`,
            );
            append([contractRow(artifact.release, artifact.digest)]);
        }
        for (const entry of selected[2]!) {
            const artifact = await this.providers.getMetadata(
                entry.publisherId as string,
                entry.providerId as string,
                entry.version as string,
            );
            if (!artifact || artifact.digest !== entry.digest) {
                throw new RepositoryDiscoveryError("RELEASE_MISMATCH", "Provider catalogue changed while indexing");
            }
            append([
                providerRow(
                    artifact.manifest,
                    artifact.digest,
                    artifact.manifest.implementations
                        .map(
                            (implementation) =>
                                contractDescriptions.get(
                                    `${implementation.contractId}\0${implementation.version}\0${implementation.digest}`,
                                ) ?? "",
                        )
                        .join("\n"),
                ),
            ]);
        }
        return { revision, rows };
    }
}
