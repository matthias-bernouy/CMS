import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareCollectionRelease } from "repository/collections/tooling/authoring/source";
import { DEFAULT_COLLECTION_LIMITS } from "repository/collections/core/limits";
import { loadCollectionBootstraps } from "../../../../../src/collections/tooling/authoring/metadataSources";
import { parseSourceSnapshot } from "../../../../../src/repository/authoring/snapshot";

test("authored bootstrap.json joins the admitted release without changing bootstrap-free builds", async () => {
    const directory = await mkdtemp(join(tmpdir(), "collection-bootstrap-"));
    const root = join(directory, "atlas");
    try {
        await mkdir(join(root, "translations/en"), { recursive: true });
        await mkdir(join(root, "examples/home"), { recursive: true });
        await mkdir(join(root, "blocs/atlas-dofficial--atlas--frame"), { recursive: true });
        await writeFile(
            join(root, "blocs/atlas-dofficial--atlas--frame/definition.json"),
            JSON.stringify({
                id: "atlas-dofficial--atlas--frame",
                kind: "component",
                catalogue: "hidden",
                label: "recipe.label",
                description: "recipe.description",
                categories: ["recipe.label"],
                root: { accepts: ["div"] },
                slots: {},
                uses: [],
                requires: [],
            }),
        );
        await writeFile(join(root, "blocs/atlas-dofficial--atlas--frame/markup.html"), "<main></main>");
        await writeFile(join(root, "blocs/atlas-dofficial--atlas--frame/style.css"), ":scope { display: block; }");
        const definition = {
            kind: "collection",
            protocol: "ulvia-collection/v1",
            schemaDialect: "ulvia-schema/v1",
            collectionId: "atlas.official/atlas",
            publisherId: "atlas.official",
            version: "1.1.0",
            name: "collection.name",
            locale: "en",
        };
        await writeFile(join(root, "definition.json"), JSON.stringify(definition));
        await writeFile(
            join(root, "translations/en/common.json"),
            JSON.stringify({
                "collection.name": "Atlas",
                "recipe.label": "Starter",
                "recipe.description": "Create a home Page.",
                "page.title": "Home",
                "page.description": "Welcome.",
            }),
        );
        await writeFile(
            join(root, "examples/home/definition.json"),
            JSON.stringify({
                id: "home",
                label: "recipe.label",
                description: "recipe.description",
                previews: [{ id: "default", frame: { width: 640, height: 480 } }],
            }),
        );
        await writeFile(
            join(root, "examples/home/document.html"),
            '<div cms-bloc="atlas-dofficial--atlas--frame"></div>',
        );
        const before = await prepareCollectionRelease(root);
        const bootstraps = [
            {
                id: "starter",
                label: "recipe.label",
                description: "recipe.description",
                requires: [],
                includes: [],
                pages: [
                    {
                        id: "home",
                        exampleId: "home",
                        path: "/",
                        title: "page.title",
                        description: "page.description",
                        indexing: true,
                        visible: true,
                    },
                ],
            },
        ];
        await writeFile(join(root, "bootstrap.json"), JSON.stringify({ bootstraps }));
        const after = await prepareCollectionRelease(root);
        expect(after.release.bootstraps).toEqual(bootstraps);
        expect(after.digest).not.toBe(before.digest);
        expect(after.release.examples).toEqual(before.release.examples);
        await writeFile(join(root, "definition.json"), JSON.stringify({ ...definition, bootstraps }));
        await expect(prepareCollectionRelease(root)).rejects.toThrow("authored in bootstrap.json");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("bootstrap source reads refuse symlinks, non-files, oversized JSON and duplicate keys", async () => {
    const root = await mkdtemp(join(tmpdir(), "bootstrap-source-bounds-"));
    const path = join(root, "bootstrap.json");
    try {
        expect(await loadCollectionBootstraps(root)).toBeUndefined();
        await writeFile(join(root, "outside.json"), '{"bootstraps":[]}');
        await symlink(join(root, "outside.json"), path);
        await expect(loadCollectionBootstraps(root)).rejects.toThrow();
        await rm(path);
        await mkdir(path);
        await expect(loadCollectionBootstraps(root)).rejects.toThrow("regular file");
        await rm(path, { recursive: true });
        await writeFile(path, " ".repeat(DEFAULT_COLLECTION_LIMITS.maxDocumentBytes + 1));
        await expect(loadCollectionBootstraps(root)).rejects.toThrow("bounded");
        await writeFile(path, '{"bootstraps":[],"bootstraps":[]}');
        await expect(loadCollectionBootstraps(root)).rejects.toThrow();
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("private collection source snapshots retain bootstrap.json only for collection authoring", () => {
    const json = JSON.stringify({
        files: [
            { path: "definition.json", content: "{}" },
            { path: "bootstrap.json", content: '{"bootstraps":[]}' },
        ],
    });
    expect(parseSourceSnapshot(json).files.map(({ path }) => path)).toEqual(["bootstrap.json", "definition.json"]);
    expect(() => parseSourceSnapshot(json, "contract")).toThrow("source path");
    expect(() => parseSourceSnapshot(json, "provider-manifest")).toThrow("source path");
});
