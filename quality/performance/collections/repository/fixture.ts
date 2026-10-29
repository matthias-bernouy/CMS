import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { admitCollectionReleaseJson } from "@bernouy/cms-repository/collections";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifestJson } from "@bernouy/cms-repository/providers";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import {
    FilesystemRepositoryCatalogueIndex,
    LocalArtifactFiles,
    LocalCollectionRepository,
    RepositoryReadEndpoint,
} from "@bernouy/cms-repository/repository/filesystem";
import { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";
import type { RepositoryFetch } from "@bernouy/cms-repository/collections/http";

const BOOTSTRAP = join(import.meta.dir, "../../../../packages/runtimes/ulvia-cli/dist/bootstrap");

type BootstrapIndex = {
    contracts: string[];
    provider: string;
    collection: string;
    collectionAssets: { id: string; path: string }[];
};

/** Uses the complete generated official release, including browser assets and examples. */
export async function repositoryFixture() {
    const definition = (await Bun.file(join(BOOTSTRAP, "index.json")).json()) as BootstrapIndex;
    const contracts = new InMemoryReleaseCatalogue();
    const admissions = await Promise.all(
        definition.contracts.map(async (path) =>
            admitContractReleaseJson(await Bun.file(join(BOOTSTRAP, path)).text()),
        ),
    );
    await publishContractSet(contracts, admissions);
    const artifact = await admitCollectionReleaseJson(
        await Bun.file(join(BOOTSTRAP, definition.collection)).text(),
        definition.collectionAssets.map(({ id, path }) => ({ id, bytes: Bun.file(join(BOOTSTRAP, path)) })),
        { contracts },
    );
    const root = await mkdtemp(join(tmpdir(), "ulvia-repository-performance-"));
    try {
        const files = new LocalArtifactFiles(root);
        for (const admission of admissions) {
            const release = admission.release;
            await files.store(
                "contracts",
                release.publisherId,
                release.contractId,
                release.version,
                admission.canonicalJson,
            );
        }
        const provider = await admitProviderManifestJson(
            await Bun.file(join(BOOTSTRAP, definition.provider)).text(),
            contracts,
        );
        await files.store(
            "providers",
            provider.manifest.provenance.publisherId,
            provider.manifest.providerId,
            provider.manifest.version,
            provider.canonicalJson,
        );
        await new LocalCollectionRepository(root).store(artifact);
        const reads = { site: 0, metadata: 0, summaries: 0, bundle: 0, asset: 0 };
        const storage = new MemoryCollectionStorage();
        const observed = new Proxy(storage, {
            get(target, property) {
                const value = Reflect.get(target, property);
                if (typeof value !== "function") {
                    return value;
                }
                return (...args: unknown[]) => {
                    if (property === "readSite") {
                        reads.site++;
                    }
                    if (property === "getReleaseMetadata") {
                        reads.metadata++;
                    }
                    if (property === "getReleaseSummaries") {
                        reads.summaries++;
                    }
                    if (property === "getRelease") {
                        reads.bundle++;
                    }
                    if (property === "getAsset") {
                        reads.asset++;
                    }
                    return value.apply(target, args);
                };
            },
        });
        const store = new CollectionStore(observed, contracts);
        await store.importAdmittedRelease(artifact);
        await store.install("installed", artifact.digest, 0, "official");
        const index = new FilesystemRepositoryCatalogueIndex(root);
        await index.refresh();
        const endpoint = new RepositoryReadEndpoint(root, index);
        const server = Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            fetch: async (request) => (await endpoint.handle(request)) ?? new Response(null, { status: 404 }),
        });
        const network = { requests: 0, bytes: 0 };
        const request: RepositoryFetch = async (url, init) => {
            const response = await fetch(url, init);
            const bytes = await response.arrayBuffer();
            network.requests++;
            network.bytes += bytes.byteLength;
            return new Response(bytes, { status: response.status, headers: response.headers });
        };
        return {
            root,
            artifact,
            store,
            reads,
            network,
            collections: new HttpCollectionRepository("official", server.url.href, { request }),
            providers: new HttpProviderRepository("official", server.url.href, { request }),
            reset() {
                for (const key of Object.keys(reads) as (keyof typeof reads)[]) {
                    reads[key] = 0;
                }
                network.requests = 0;
                network.bytes = 0;
            },
            async close() {
                await server.stop(true);
                await rm(root, { recursive: true, force: true });
            },
        };
    } catch (error) {
        await rm(root, { recursive: true, force: true });
        throw error;
    }
}
