import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RepositoryAuthoring } from "@bernouy/repository/repository/authoring";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";

export const sourceJson = JSON.stringify({
    files: [
        {
            path: "definition.json",
            content: JSON.stringify({
                kind: "collection",
                protocol: "ulvia-collection/v1",
                schemaDialect: "ulvia-schema/v1",
                publisherId: "publisher",
                collectionId: "publisher/kit",
                version: "1.0.0",
                name: "collection.name",
                locale: "en",
            }),
        },
        { path: "translations/en/base.json", content: '{"collection.name":"Kit"}' },
    ],
});

export function authoringAt(root: string) {
    const status = async () => ({ configured: false, repositoryUrl: "http://127.0.0.1", repositoryId: null });
    return new RepositoryAuthoring(
        {
            root,
            contracts: new InMemoryReleaseCatalogue(),
            readAsset: async () => {
                throw new Error("Unexpected asset read");
            },
        },
        {
            repositoryUrl: "http://127.0.0.1",
            repositorySourceId: "local",
            connectionStatus: status,
            configureConnection: status,
            disconnectConnection: status,
            listNamespaces: async () => ({ items: [], nextCursor: null }),
            credential: async () => {
                throw new Error("Unexpected credential access");
            },
            claim: async () => {
                throw new Error("Unexpected namespace claim");
            },
        },
    );
}

export async function fillPreparations(root: string) {
    const authoring = authoringAt(root);
    const prepared = await authoring.prepare(sourceJson);
    const original = JSON.parse(await Bun.file(join(root, prepared.preparationId, "prepared.json")).text());
    for (let i = 1; i < 64; i++) {
        const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
        await mkdir(join(root, id));
        await writeFile(join(root, id, "prepared.json"), JSON.stringify({ ...original, id }));
        if (i === 1 || i === 2) {
            await writeFile(
                join(root, id, "publication.json"),
                JSON.stringify({
                    schema: "ulvia.collection-publication.v1",
                    digest: original.digest,
                    sourcesStored: i === 1,
                }),
            );
        }
    }
    return authoring;
}
