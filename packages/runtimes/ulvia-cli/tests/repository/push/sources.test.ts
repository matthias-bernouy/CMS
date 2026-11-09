import { expect, test } from "bun:test";
import { cp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { FilesystemRepositorySourceStore } from "@bernouy/repository/repository/sources";
import { LocalCollectionRepository } from "@bernouy/repository/repository/filesystem";
import { sourceFixture } from "../../../../../../tests/fixtures/repository/sourceBuild";
import { pushFixture } from "./fixtures";

test("release captures editable sources locally and push builds that snapshot despite later working tree edits", async () => {
    const f = await pushFixture();
    try {
        await f.run(["namespace", "claim", "ulvia.test"]);
        const wrong = join(f.source, "wrong-folder");
        await cp(resolve(import.meta.dir, "../../stack/fixtures/smoke-kit"), wrong, { recursive: true });
        await expect(f.run(["release", wrong])).rejects.toThrow("does not match definition ID");
        expect(await new LocalCollectionRepository(join(f.data, "repository")).listMetadata()).toHaveLength(0);
        const source = join(f.source, "smoke-kit");
        await cp(resolve(import.meta.dir, "../../stack/fixtures/smoke-kit"), source, { recursive: true });
        await writeFile(join(source, "README.md"), "# Collection authoring notes");
        await writeFile(
            join(source, "blocs/ulvia-dtest--smoke-kit--card/bloc.ts"),
            'export function mount(root: HTMLElement) { const listener = () => {}; root.addEventListener("click", listener); return () => root.removeEventListener("click", listener); }',
        );
        await f.run(["release", source]);
        const local = await new FilesystemRepositorySourceStore(join(f.data, "repository")).get(
            "ulvia.test",
            "ulvia.test/smoke-kit",
            "1.0.0",
        );
        expect(local).not.toBeNull();
        expect(await new LocalCollectionRepository(f.remote).listMetadata()).toHaveLength(0);
        await writeFile(join(source, "translations/en/metadata.json"), "{}");
        const registry = f.application.registry;
        const build = registry.buildCollection!.bind(registry);
        let unavailable = true;
        registry.buildCollection = async (...args) => {
            if (unavailable) {
                unavailable = false;
                throw new Error("Transient build storage failure");
            }
            return build(...args);
        };
        await expect(f.run(["push", "ulvia.test/smoke-kit@1.0.0"])).rejects.toThrow("503");
        await f.run(["push", "ulvia.test/smoke-kit@1.0.0"]);
        expect(
            await new FilesystemRepositorySourceStore(f.remote).get("ulvia.test", "ulvia.test/smoke-kit", "1.0.0"),
        ).toEqual(local);
        expect((await new LocalCollectionRepository(f.remote).listMetadata())[0]!.digest).toBe(local!.releaseDigest);
        await f.run(["push", "ulvia.test/smoke-kit@1.0.0"]);
        expect(f.output.at(-1)).toStartWith("= collection");
    } finally {
        await f.close();
    }
}, 20_000);

test("a collection release module and push keep text-authored assets inside their source snapshot", async () => {
    const f = await pushFixture();
    const authored = await sourceFixture();
    try {
        await f.run(["namespace", "claim", "publisher"]);
        const snapshot = JSON.parse(authored.sourceJson);
        snapshot.files.push({ path: "assets/data.txt", content: "immutable source bytes" });
        snapshot.assets = [];
        const compiler = import.meta.resolve("@bernouy/repository/repository/authoring/build");
        const moduleSource = `import { compileCollectionSources } from ${JSON.stringify(compiler)};
export default async function () {
    const built = await compileCollectionSources(${JSON.stringify(join(f.root, "module-builds"))}, ${JSON.stringify(JSON.stringify(snapshot))}, []);
    return [{ kind: "collection", ...built }];
}`;
        await writeFile(join(f.source, "ulvia.release.ts"), moduleSource);
        await f.run(["release", f.source]);
        const local = await new FilesystemRepositorySourceStore(join(f.data, "repository")).get(
            "publisher",
            "publisher/kit",
            "1.0.0",
        );
        expect(JSON.parse(local!.sourceJson).assets).toEqual([]);
        await f.run(["push", "publisher/kit@1.0.0"]);
        expect(await new FilesystemRepositorySourceStore(f.remote).get("publisher", "publisher/kit", "1.0.0")).toEqual(
            local,
        );
        const artifact = await new LocalCollectionRepository(f.remote).get("publisher", "publisher/kit", "1.0.0");
        expect(await artifact!.assets[0]!.bytes.text()).toBe("immutable source bytes");
    } finally {
        await authored.close();
        await f.close();
    }
}, 20_000);
