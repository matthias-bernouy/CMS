import { join } from "node:path";
import { rm } from "node:fs/promises";
import { CollectionAuthoring } from "@bernouy/cms-repository/repository/authoring";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { communityFixture } from "../community/fixtures";

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
    const f = await communityFixture();
    const contracts = new InMemoryReleaseCatalogue();
    const authoring = new CollectionAuthoring(
        {
            root: join(f.root, "preparations"),
            contracts,
            readAsset: async () => {
                throw new Error("Unexpected asset read");
            },
        },
        {
            repositoryUrl: f.base,
            repositorySourceId: "local",
            listNamespaces: async () => ({ items: [], nextCursor: null }),
            trackNamespace: async () => {
                throw new Error("Unused namespace tracker");
            },
            identity: async () => ({ publicKey: f.key.publicKey }),
            claim: async () => {
                throw new Error("Already claimed");
            },
            credential: async (namespace) => {
                if (namespace !== f.credential.namespace) {
                    throw new Error("Foreign namespace");
                }
                return f.credential;
            },
        },
    );
    return {
        ...f,
        authoring,
        contracts,
        close: async () => {
            f.server.stop(true);
            await rm(f.root, { recursive: true, force: true });
        },
    };
}
