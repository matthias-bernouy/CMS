import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { CollectionAuthoring } from "@bernouy/cms-repository/repository/authoring";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { repositoryApplication } from "../../../../../../tests/fixtures/repository/application";
import { RepositoryPublisher } from "../../../src/runtime/stores/repository/RepositoryPublisher";

export function sourceSnapshot(version = "1.0.0", publisherId = "community") {
    return JSON.stringify({
        files: [
            {
                path: "definition.json",
                content: JSON.stringify({
                    kind: "collection",
                    protocol: "ulvia-collection/v1",
                    schemaDialect: "ulvia-schema/v1",
                    publisherId,
                    collectionId: "sample",
                    version,
                    name: "collection.name",
                    locale: "en",
                }),
            },
            {
                path: "translations/en/base.json",
                content: JSON.stringify({ "collection.name": "Sample collection", "bloc.label": "Panel" }),
            },
            {
                path: "blocs/sample-panel/definition.json",
                content: JSON.stringify({
                    description: "bloc.label",
                    categories: ["bloc.label"],
                    examples: ["panel"],
                    defaultExample: "panel",

                    kind: "component",
                    id: "sample-panel",
                    label: "bloc.label",
                    root: { accepts: ["div"] },
                    slots: { body: { accepts: [{ kind: "native-content", profile: "prose" }] } },
                    uses: [],
                    requires: [],
                }),
            },
            {
                path: "examples/panel/definition.json",
                content: JSON.stringify({
                    id: "panel",
                    label: "bloc.label",
                    description: "bloc.label",
                    previews: [{ id: "desktop", frame: { width: 640, height: 240 } }],
                }),
            },
            {
                path: "examples/panel/document.html",
                content: '<div cms-bloc="sample-panel"><p slot="body">Example</p></div>',
            },
            { path: "blocs/sample-panel/markup.html", content: '<section><slot name="body"></slot></section>' },
            { path: "blocs/sample-panel/style.css", content: ":scope { display: block; }" },
        ],
    });
}

export async function authoringFixture() {
    const root = await mkdtemp(join(tmpdir(), "account-authoring-"));
    const application = repositoryApplication(join(root, "registry"));
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: application.handle });
    const secrets = new InMemorySecretStore();
    const contracts = new InMemoryReleaseCatalogue();
    const publisher = new RepositoryPublisher(server.url.origin, "local", secrets);
    const account = await application.account();
    await publisher.configureConnection(account.token);
    await publisher.claim("community");
    const authoring = new CollectionAuthoring(
        {
            root: join(root, "preparations"),
            contracts,
            readAsset: async () => {
                throw new Error("Unexpected asset read");
            },
        },
        publisher,
    );
    return {
        root,
        application,
        server,
        secrets,
        contracts,
        authoring,
        base: server.url.origin,
        credential: await publisher.credential("community"),
        async close() {
            server.stop(true);
            await application.close();
            await rm(root, { recursive: true, force: true });
        },
    };
}
