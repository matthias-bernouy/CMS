import { expect } from "bun:test";
import { docker } from "../containers";

/** Gate the warm read budget on real Mongo while keeping settings/route rereads and published visibility. */
export async function exerciseRenderingResources(providerName: string, stackId: string) {
    const database = `ulvia_render_${stackId.replaceAll("-", "_")}`;
    const script = `
        import { strict as assert } from "node:assert";
        import { MongoClient } from "mongodb";
        import { MongoContentRepository } from "@bernouy/cms-content/mongo";
        import { ValidatingContentRepository } from "@bernouy/cms-content";
        import { createContentReader } from "@bernouy/cms-content/rendering";
        import { CollectionStore } from "@bernouy/cms-repository/collections/installations";
        import { MongoCollectionStorage } from "@bernouy/cms-repository/collections/mongo";
        import { withInstalledCollections } from "@bernouy/cms-repository/collections/content";
        import { collectionFixture } from "/app/packages/features/cms-repository/tests/collections/admission/examples/buildFixture";
        import { readProviderRuntimeEnv } from "/app/packages/runtimes/ulvia-provider-server/src/runtimeEnv";
        const name = ${JSON.stringify(database)};
        assert.match(name, /^ulvia_render_[a-z0-9_]+$/);
        const client = new MongoClient(readProviderRuntimeEnv(process.env).MONGO_URL, { monitorCommands: true });
        let commands = [];
        client.on("commandStarted", event => { commands.push(event.command[event.commandName]); });
        await client.connect();
        const db = client.db(name);
        try {
            const local = new MongoContentRepository(db);
            await local.init();
            const storage = new MongoCollectionStorage(db);
            await storage.init();
            const collections = new CollectionStore(storage);
            const artifact = await collections.importRelease(collectionFixture({
                kind: "collection", protocol: "ulvia-collection/v1", schemaDialect: "ulvia-schema/v1",
                collectionId: "scoped", publisherId: "example", version: "1.0.0", name: "name", locale: "en",
                translations: { en: { name: "Scoped", label: "Card" } }, assets: [],
                texts: [{ id: "title", label: "label", group: "label", category: "label", values: { en: "Initial" } }],
                blocs: [{ kind: "component", id: "scoped-card", root: { accepts: ["div"] }, label: "label", description: "label",
                    categories: ["label"], markup: "<article></article>", uses: [], requires: [], slots: {} }],
            }));
            await collections.install("site", artifact.digest, 0);
            await local.insertPage("/", "Home", '<div cms-bloc="scoped-card"></div>');
            const page = await local.getPage("/");
            await local.updatePage({ id: page.id, visible: true }, page.revision);
            const repository = new ValidatingContentRepository(withInstalledCollections(local, collections, "site"));
            const reader = createContentReader(repository);
            await reader.getPageRenderInputs("/");
            commands = [];
            const first = await reader.getPageRenderInputs("/");
            assert.equal(first.route.kind, "current");
            assert.equal(commands.length, 9);
            const count = collection => commands.filter(value => value === collection).length;
            assert.equal(count("collection_installations"), 1);
            assert.equal(count("blocs"), 2);
            assert.equal(count("system"), 3);
            assert.equal(count("page_routes"), 2);
            assert.equal(count("pages"), 1);
            commands = [];
            await reader.getPageRenderInputs("/");
            assert.equal(commands.length, 9);
            assert.equal(count("collection_installations"), 1);
            await collections.saveTexts("site", "scoped", 1, { title: { en: "Changed" } });
            const changed = await reader.getPageRenderInputs("/");
            assert.equal(changed.contentTexts[0].resolve("en").title, "Changed");
            assert.notEqual(changed.artifactRevision, first.artifactRevision);
            await collections.uninstall("site", "scoped", 2);
            assert.equal((await reader.getPageRenderInputs("/")).renderableBlocs.some(bloc => bloc.id === "scoped-card"), false);
            const current = await local.getPage("/");
            await local.updatePage({ id: current.id, visible: false }, current.revision);
            assert.deepEqual((await reader.getPageRenderInputs("/")).route, { kind: "unavailable" });
            console.log(JSON.stringify({ warmCommands: 9, collectionReads: 1, settingsReads: 3, routeReads: 2, changesFresh: true }));
        } finally { await db.dropDatabase(); await client.close(); }
    `;
    const result = await docker([
        "exec",
        "--workdir",
        "/app/packages/runtimes/ulvia-provider-server",
        providerName,
        "bun",
        "--no-macros",
        "-e",
        script,
    ]);
    expect(JSON.parse(result.stdout.trim())).toEqual({
        warmCommands: 9,
        collectionReads: 1,
        settingsReads: 3,
        routeReads: 2,
        changesFresh: true,
    });
}
