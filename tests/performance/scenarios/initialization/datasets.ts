import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { prepareCollectionRelease } from "@bernouy/repository/collections/build";
import { captureCollectionSources } from "@bernouy/repository/repository/authoring/build";
import { RepositoryNamespaceClient } from "@bernouy/repository/repository/namespaces";
import { RemoteRepositoryClient } from "@bernouy/repository/repository/publication";
import { authoredFixture } from "../../fixtures/authored";
import type { ContractParentReference } from "@bernouy/ulvia-contracts";
import type { CollectionBootstrapReference } from "@bernouy/repository/collections";

export type Dataset = Readonly<{
    root: CollectionBootstrapReference | null;
    paths: readonly string[];
    collections: number;
    pages?: readonly Readonly<{
        path: string;
        title: string;
        description: string;
        visible: boolean;
        indexing: boolean;
        systemRole?: string;
    }>[];
}>;

/** Compile actual authored sources; fixture publications are outside every measurement. */
export async function bootstrapDataset(
    implementation: ContractParentReference,
    name: string,
    pages: number,
    includes: readonly Dataset[] = [],
    version = "1.0.0",
    assetBytes = 0,
) {
    const source = authoredFixture("collection", "performance-init", implementation, name);
    const temporary = await mkdtemp(join(tmpdir(), "ulvia-initialization-performance-"));
    const directory = join(temporary, source.id.split("/")[1]!);
    try {
        const files = JSON.parse(source.sourceJson).files as { path: string; content: string }[];
        for (const file of files) {
            const path = join(directory, file.path);
            await mkdir(dirname(path), { recursive: true });
            await writeFile(
                path,
                file.path === "definition.json"
                    ? JSON.stringify({ ...JSON.parse(file.content), version })
                    : file.content,
            );
        }
        const paths = Array.from({ length: pages }, (_, index) => `/performance-${name}/page-${index}`);
        await writeFile(
            join(directory, "bootstrap.json"),
            JSON.stringify({
                bootstraps: [
                    {
                        id: "start",
                        label: "collection.name",
                        description: "bloc.label",
                        requires: [],
                        includes: includes.map((child) => child.root),
                        pages: paths.map((path, index) => ({
                            id: `page-${index}`,
                            exampleId: "panel",
                            path,
                            title: "collection.name",
                            description: "bloc.label",
                            indexing: false,
                            visible: true,
                        })),
                    },
                ],
            }),
        );
        if (assetBytes) {
            await mkdir(join(directory, "assets"));
            await writeFile(join(directory, "assets/controlled.txt"), Buffer.alloc(assetBytes, "x"));
        }
        const artifact = await prepareCollectionRelease(directory);
        const snapshot = await captureCollectionSources(directory);
        const dataset: Dataset = {
            root: {
                publisherId: artifact.release.publisherId,
                collectionId: artifact.release.collectionId,
                version,
                digest: artifact.digest,
                bootstrapId: "start",
            },
            paths: [...paths, ...includes.flatMap((child) => child.paths)],
            collections: 1 + includes.reduce((sum, child) => sum + child.collections, 0),
        };
        return { artifact, snapshot, dataset };
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
}

export async function datasetPublisher(origin: string, token: string) {
    const namespaces = new RepositoryNamespaceClient(origin, {
        allowInsecureHttp: true,
        credential: {
            origin,
            repositoryId: await new RepositoryNamespaceClient(origin, { allowInsecureHttp: true }).identity(),
            resolveToken: async () => token,
        },
    });
    await namespaces.claim("performance-init");
    const client = new RemoteRepositoryClient(origin, await namespaces.ownedCredential("performance-init"), {
        allowInsecureHttp: true,
    });
    return async (candidate: Awaited<ReturnType<typeof bootstrapDataset>>) => {
        const published = await client.push({
            kind: "collection",
            canonicalJson: candidate.artifact.canonicalJson,
            sourceJson: candidate.snapshot.sourceJson,
            assets: candidate.snapshot.assets,
        });
        if (published.digest !== candidate.artifact.digest) {
            throw new Error("Fixture publication digest mismatch");
        }
        return candidate.dataset;
    };
}
