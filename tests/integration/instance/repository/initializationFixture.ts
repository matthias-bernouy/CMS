import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { prepareCollectionRelease } from "@bernouy/repository/collections/build";
import { captureCollectionSources } from "@bernouy/repository/repository/authoring/build";
import { RepositoryNamespaceClient } from "@bernouy/repository/repository/namespaces";
import { RemoteRepositoryClient } from "@bernouy/repository/repository/publication";

/** Author a disposable recipe; production ships no starter collection. */
export async function publishInitializationFixture(origin: string, token: string) {
    const namespaces = new RepositoryNamespaceClient(origin, {
        allowInsecureHttp: true,
        credential: {
            origin,
            repositoryId: await new RepositoryNamespaceClient(origin, { allowInsecureHttp: true }).identity(),
            resolveToken: async () => token,
        },
    });
    await namespaces.claim("ulvia.test");
    const root = await mkdtemp(join(tmpdir(), "ulvia-setup-recipe-"));
    const directory = join(root, "smoke-kit");
    try {
        await cp(
            resolve(import.meta.dir, "../../../../packages/runtimes/ulvia-cli/tests/stack/fixtures/smoke-kit"),
            directory,
            { recursive: true },
        );
        const definition = await Bun.file(join(directory, "definition.json")).json();
        await writeFile(
            join(directory, "definition.json"),
            JSON.stringify({ ...definition, name: "setup.name", description: "setup.description" }),
        );
        await mkdir(join(directory, "translations/en"), { recursive: true });
        await writeFile(
            join(directory, "translations/en/setup.json"),
            JSON.stringify({ "setup.name": "Test starter", "setup.description": "One test Page" }),
        );
        await writeFile(
            join(directory, "bootstrap.json"),
            JSON.stringify({
                bootstraps: [
                    {
                        id: "home",
                        label: "setup.name",
                        description: "setup.description",
                        requires: [],
                        includes: [],
                        pages: [
                            {
                                id: "home",
                                exampleId: "card",
                                path: "/",
                                title: "setup.name",
                                description: "setup.description",
                                indexing: false,
                                visible: true,
                            },
                        ],
                    },
                ],
            }),
        );
        const source = await captureCollectionSources(directory);
        const release = await prepareCollectionRelease(directory);
        await new RemoteRepositoryClient(origin, await namespaces.ownedCredential("ulvia.test"), {
            allowInsecureHttp: true,
        }).push({
            kind: "collection",
            canonicalJson: release.canonicalJson,
            sourceJson: source.sourceJson,
            assets: source.assets,
        });
        return release;
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}
