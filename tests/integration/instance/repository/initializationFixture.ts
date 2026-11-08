import { resolve } from "node:path";
import { prepareCollectionRelease } from "@bernouy/repository/collections/build";
import { admitCollectionRelease } from "@bernouy/repository/collections";
import { RepositoryNamespaceClient } from "@bernouy/repository/repository/namespaces";
import { RemoteRepositoryClient } from "@bernouy/repository/repository/publication";

/** Deliberately tiny test-authored recipe; production ships no starter collection. */
export async function publishInitializationFixture(origin: string, token: string) {
    const namespaces = new RepositoryNamespaceClient(origin, {
        credential: {
            origin,
            repositoryId: await new RepositoryNamespaceClient(origin).identity(),
            resolveToken: async () => token,
        },
    });
    await namespaces.claim("ulvia.test");
    const base = await prepareCollectionRelease(
        resolve(import.meta.dir, "../../../../packages/runtimes/ulvia-cli/tests/stack/fixtures/smoke-kit"),
    );
    const release = await admitCollectionRelease({
        ...base.release,
        name: "name",
        translations: { en: { ...base.release.translations.en, name: "Test starter", description: "One test Page" } },
        examples: [
            ...(base.release.examples ?? []),
            {
                id: "home",
                label: "name",
                description: "description",
                document: {
                    html: '<div cms-bloc="ulvia-dtest--smoke-kit--card"><h1 slot="content">Test starter</h1></div>',
                },
                previews: [{ id: "desktop", frame: { width: 640, height: 240 } }],
            },
        ],
        bootstraps: [
            {
                id: "home",
                label: "name",
                description: "description",
                requires: [],
                includes: [],
                pages: [
                    {
                        id: "home",
                        exampleId: "home",
                        path: "/",
                        title: "name",
                        description: "description",
                        indexing: false,
                        visible: true,
                    },
                ],
            },
        ],
    });
    await new RemoteRepositoryClient(origin, await namespaces.ownedCredential("ulvia.test")).push({
        kind: "collection",
        canonicalJson: release.canonicalJson,
        assets: [],
    });
    return release;
}
